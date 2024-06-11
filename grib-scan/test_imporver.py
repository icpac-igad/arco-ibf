import time
import os
import sys
import re
import calendar
import json
import tempfile
from datetime import datetime, timedelta
import ntpath

import xarray as xr
import zarr
import ujson
import fsspec
import boto3
from botocore.exceptions import BotoCoreError, ClientError
import coiled
import kerchunk
from kerchunk.grib2 import scan_grib
from kerchunk.combine import MultiZarrToZarr

import iris
from improver.nbhood.nbhood import BaseNeighbourhoodProcessing as NBHood
import glob
from improver.utilities.cube_manipulation import collapse_realizations
import improver.cli as imprcli


@coiled.function(
    # memory="2 GiB",
    vm_type="t3.small",
    software="improver-docker-coiled-env-v5",
    name=f"func-combine-gefs-t6",
    region="us-east-1",  # Specific region
    arm=False,  # Change architecture
    idle_timeout="5 minutes",
)
def thr_improver_make_gefs_kc_zarr_df(date, run):
    fs_s3 = fsspec.filesystem("s3", anon=False)
    # combined = fs_s3.glob(f"s3://arco-ibf/fcst/gefs_ens/{date}/{run}/gep*")
    year = date[:4]
    month = date[4:6]
    combined = fs_s3.glob(
        f"s3://arco-ibf/fcst/gefs_ens/{year}/{month}/{date}/{run}/gep*"
    )
    combined1 = ["s3://" + f for f in combined]
    mzz = MultiZarrToZarr(
        combined1,
        remote_protocol="s3",
        remote_options={"anon": False},
        concat_dims=["number"],
        identical_dims=["valid_time", "longitude", "latitude"],
    )
    out = mzz.translate()
    fs_ = fsspec.filesystem(
        "reference", fo=out, remote_protocol="s3", remote_options={"anon": True}
    )
    m = fs_.get_mapper("")
    ds = xr.open_dataset(m, engine="zarr", backend_kwargs=dict(consolidated=False))
    min_lon = 21
    min_lat = -12
    max_lon = 53
    max_lat = 24
    sub_ds = ds.sel(latitude=slice(max_lat, min_lat), longitude=slice(min_lon, max_lon))
    data_arrays = []
    for val_time in sub_ds["valid_time"].values[0:16]:
        is_six_hourly = (
            time in sub_ds.valid_time.values[sub_ds.valid_time.dt.hour % 6 == 0]
        )
        if is_six_hourly:
            six_hourly_steps = time
            print(f"checked six hour {six_hourly_steps}")
            prev_3hr_steps = six_hourly_steps - np.timedelta64(3, "h")
            print(f"previous 3 hour step and it is {prev_3hr_steps}")
            prev_3hr_data = sub_ds.sel(valid_time=prev_3hr_steps)
            prev_6hr_data = sub_ds.sel(valid_time=six_hourly_steps)
            corr_hr = prev_6hr_data - prev_3hr_data
            sub_ds = corr_hr.assign_coords(valid_time=[six_hourly_steps])
            print(f"corrected the tp for step {six_hourly_steps}")
        else:
            pass
        dbd = sub_ds["tp"]
        dbd1 = dbd.sel(valid_time=val_time)
        dbd1.attrs["standard_name"] = "precipitation_amount"
        cube = dbd1.to_iris()
        output = imprcli.threshold.process(cube, threshold_values=[5, 10, 20, 40, 60])
        radii = [25000]
        plugin = NBHood(radii)
        aa = plugin(output)
        result = collapse_realizations(aa)
        das = xr.DataArray.from_iris(result)
        data_arrays.append(das)
    # dataset = data_array.to_dataset()
    ds = xr.concat(data_arrays, dim="valid_time", data_vars="all")
    ds = ds.reset_coords(drop=False)
    #     chunks = {
    #     'threshold': 1,
    #     'latitude': -1,   # -1 indicates to use the full dimension
    #     'longitude': -1,  # -1 indicates to use the full dimension
    #     'valid_time': 1
    #     }
    #     # Now we'll chunk the dataset according to the strategy defined above.
    #     ds_chunked = ds.chunk(chunks)
    folder_year = date[:4]
    folder_month = date[4:6]
    folder_date = date
    s3_location = (
        f"fcst/gefs_ens/{folder_year}/{folder_month}/{folder_date}/{run}/imp2d-2t.zarr"
    )
    store = zarr.storage.FSStore(f"s3://arco-ibf/{s3_location}")
    # ds1= ds.chunk(chunk_sizes)
    encoding_settings = {}
    # encoding_settings['dis24'] = {'_FillValue': -32767.0, 'dtype': 'short', 'chunks': (10,2,144,128)}
    ds.to_zarr(store, mode="w", encoding=encoding_settings, consolidated=True)
    return "imporver zarr uploaded"


date = "20231107"
run = "00"
sub_ds = thr_improver_make_gefs_kc_zarr_df(date, run)
