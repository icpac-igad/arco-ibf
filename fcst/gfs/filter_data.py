# Python standard libraries
import os
import sys
import re
import calendar
from datetime import datetime, timedelta

# Third-party libraries
import xarray as xr
import ujson
import urllib.request
import fsspec
import dask
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

import geopandas as gp
import cartopy.crs as ccrs

from cfgrib.xarray_store import open_dataset
import google.auth
from google.cloud import storage
import pygrib


def retrieve_url_data(out_path, url, prefix, https=False):
    if os.path.exists(out_path + "grib/" + url.split("/")[1] + url.split("/")[-1]):
        return

    if https:
        urllib.request.urlretrieve(url, out_path + "grib/" + url.split("/")[-1])

    else:
        client = storage.Client.create_anonymous_client()
        bucket = client.bucket(prefix, user_project=None)
        blob = storage.Blob(url.replace(f"{prefix}/", ""), bucket)
        blob.download_to_filename(
            filename=out_path + "grib/" + url.split("/")[1] + url.split("/")[-1],
            client=client,
        )
        #!rm out_path+'/*.idx'


def open_and_get_variable(out_path, url, var_name, var_level):
    # print(var_level, var_name)

    var_filter = {
        "typeOfLevel": var_level,
        "name": var_name,
    }

    try:
        df = open_dataset(
            out_path + "grib/" + url.split("/")[-1], filter_by_keys=var_filter
        )

    except:
        var_filter["stepType"] = "instant"

        df = open_dataset(
            out_path + "grib/" + url.split("/")[-1], filter_by_keys=var_filter
        )

    if var_level == "isobaricInhPa":
        df = df.sel({"isobaricInhPa": [200, 700]})

    return df


@dask.delayed
def loop_over_url_data_retrieval(
    out_path, urls, prefix, var_name, var_level, https=False
):
    df_all = []

    for url in urls:
        try:
            retrieve_url_data(out_path, url, prefix, https=https)
            df_all.append(open_and_get_variable(out_path, url, var_name, var_level))
        except:
            print(url, "did not work...")

            pass
    try:
        df_all = xr.concat(df_all, "step").expand_dims(
            dim={"time": [df_all[0].time.values]}, axis=0
        )  # .chunk({'latitude':1,'longitude':1,'step':1})
    # print(df_all.step.values)
    except:
        print(df_all[0])
        return

    date = url.split("/")[-2]  # .split('.')[1]
    year = date[:4]
    model = url.split("/")[-1].split(".")[0]
    timestep = date[-2:]  # url.split('/')[-1].split('.')[1]
    lead_time1 = urls[0].split("/")[-1].split(".")[-2]
    lead_time2 = url.split("/")[-1].split(".")[-2]

    df_all.to_zarr(
        out_path
        + "netcdf/"
        + model
        + date
        + "_"
        + timestep
        + "_"
        + lead_time1
        + "_"
        + lead_time2
        + "_"
        + var_name.replace(" ", "-")
        + "_"
        + var_level
        + ".zarr"
    )

    return
