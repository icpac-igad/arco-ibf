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

#import geopandas as gp
import cartopy.crs as ccrs

from cfgrib.xarray_store import open_dataset
import google.auth
from google.cloud import storage
#import pygrib


def retrieve_url_data(out_path, url, prefix, https=False):

    if https:
        if os.path.exists(out_path + "grib/" + url.split("/")[-1]):
            return
    else:
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


def open_and_get_variable(out_path, url, var_name, var_level, https=False):
    # print(var_level, var_name)

    var_filter = {
        "typeOfLevel": var_level,
        "name": var_name,
    }

    try:
        if https:
            #print(var_filter)
            df = open_dataset(
                out_path + "grib/"+ url.split("/")[-1], filter_by_keys=var_filter
            )
        else:
            df = open_dataset(
                out_path + "grib/"+ url.split("/")[1] + url.split("/")[-1], filter_by_keys=var_filter
            )

    except:
        var_filter["stepType"] = "instant"

        if https:
            df = open_dataset(
                out_path + "grib/"+ url.split("/")[-1], filter_by_keys=var_filter
            )
        else:
            df = open_dataset(
                out_path + "grib/"+ url.split("/")[1] + url.split("/")[-1], filter_by_keys=var_filter
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
        #try:
        retrieve_url_data(out_path, url, prefix, https=https)
        df_all.append(open_and_get_variable(out_path, url, var_name, var_level, https=https))
        #except:
        #    print(url, "did not work...")

        #    pass
    try:
        df_all = xr.concat(df_all, "step").expand_dims(
            dim={"time": [df_all[0].time.values]}, axis=0
        )  # .chunk({'latitude':1,'longitude':1,'step':1})
    # print(df_all.step.values)
    except:
        print(var_name, var_level)
        print(df_all[0])
        return

    if https:
        date = url.split("/")[-2]
        model = url.split("/")[-1].split(".")[0]
    else:
        date = url.split("/")[1].split('.')[1]
        model = url.split("/")[1].split(".")[0]
    
    year = date[:4]
    
    timestep = "t00z"#url.split('/')[-1].split('.')[1] #date[-2:]
    lead_time1 = urls[0].split("/")[-1].split(".")[-2]
    lead_time2 = url.split("/")[-1].split(".")[-2]

    df_all.to_zarr(\
        out_path
        + "netcdf/"
        + model
        + date
        + "_"
        + timestep
        + "_f030_f175_"
        + var_name.replace(" ", "-")
        + "_"
        + var_level
        + ".zarr"
    )


    return
