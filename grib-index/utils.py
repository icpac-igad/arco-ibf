%load_ext autoreload
%autoreload 2

import os
import logging
import importlib

importlib.reload(logging)
logging.basicConfig(
    format="%(asctime)s.%(msecs)03dZ %(processName)s %(threadName)s %(levelname)s:%(name)s:%(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    level=logging.WARNING,
)

logger = logging.getLogger("colab")

from datetime import datetime, timedelta
import copy
import xarray as xr
import numpy as np
import pandas as pd
import fsspec
import kerchunk
from kerchunk.grib2 import scan_grib, grib_tree
import gcsfs
import datatree
import pickle
# This could be generalized to any gridded FMRC dataset but right now it works with NOAA's Grib2 files
import dynamic_zarr_store
from dotenv import load_dotenv

import gcsfs


def gefs_gcs_url_maker(date, run):
    # Create a GCS filesystem object (assuming public data similar to the 'anon' in AWS)
    fs_gcs = gcsfs.GCSFileSystem(anon=True)  # Set anon=False and configure credentials if needed
    
    # List of ensemble members
    members = [str(i).zfill(2) for i in range(1, 31)]
    gcsurl_ll = []
    
    for ensemble_member in members:
        gcsurl_glob = fs_gcs.glob(
            f"gs://gfs-ensemble-forecast-system/gefs.{date}/{run}/atmos/pgrb2sp25/gep{ensemble_member}.*"
        )
        gcsurl_only_grib = [f for f in gcsurl_glob if f.split(".")[-1] != "idx"]
        fmt_gcsog = sorted([f"gs://{f}" for f in gcsurl_only_grib])
        gcsurl_ll.append(fmt_gcsog[1:])
        
    gefs_url = [item for sublist in gcsurl_ll for item in sublist]
    return gefs_url


def map_from_index(
    mapping: pd.DataFrame,
    idxdf: pd.DataFrame,
    raw_merged: bool = False,
):
    """
    Main method used for building index dataframes from parsed IDX files merged with the correct mapping for the horizon
    :param run_time: the run time timestamp of the idx data
    :param mapping: the mapping data derived from comparing the idx attributes to the CFGrib attributes for a given horizon
    :param idxdf: the dataframe of offsets and lengths for each grib message and its attributes derived from an idx file
    :param raw_merged: Used for debugging to see all the columns in the merge. By default, it returns the kindex
    columns with the corrected time values plus the index metadata
    :return: the index dataframe that will be used to read variable data from the grib file
    """

    idxdf = idxdf.reset_index().set_index("attrs")
    mapping = mapping.reset_index().set_index("attrs")
    mapping.drop(columns="uri", inplace=True)  # Drop the URI column from the mapping

    if not idxdf.index.is_unique:
        raise ValueError("Parsed idx data must have unique attrs to merge on!")

    if not mapping.index.is_unique:
        raise ValueError("Mapping data must have unique attrs to merge on!")

    # Merge the offset and length from the idx file with the varname, step and level from the mapping

    result = idxdf.merge(mapping, on="attrs", how="left", suffixes=("", "_mapping"))

    if raw_merged:
        return result
    else:
        # Get the grib_uri column from the idxdf and ignore the uri column from the mapping
        # We want the offset, length and uri of the index file with the varname, step and level of the mapping
        selected_results = result.rename(columns=dict(grib_uri="uri"))[
            [
                "varname",
                "typeOfLevel",
                "stepType",
                "name",
                "step",
                "level",
                "time",
                "valid_time",
                "uri",
                "offset",
                "length",
                "inline_value",
                "grib_crc32",
                "grib_updated_at",
                "idx_crc32",
                "idx_updated_at",
                "indexed_at",
            ]
        ]
    # Drop the inline values from the mapping data
    selected_results.loc[:, "inline_value"] = None
    #selected_results.loc[:, "time"] = run_time
    selected_results.loc[:, "valid_time"] = (
        selected_results.time + selected_results.step
    )
    logger.info("Dropping %d nan varnames", selected_results.varname.isna().sum())
    selected_results = selected_results.loc[~selected_results.varname.isna(), :]
    return selected_results.reset_index(drop=True)




def real_time_index_maker(avlbl_urls,deduped_mapping):
    mapped_index_list = []
    for fname in avlbl_urls:
        idxdf = dynamic_zarr_store.parse_grib_idx(
        fs=fsspec.filesystem("gcs"),
        basename=fname)
        mapped_index = map_from_index(
        deduped_mapping,
        idxdf.loc[~idxdf["attrs"].duplicated(keep="first"), :],)
        mapped_index_list.append(mapped_index)
    gfs_kind = pd.concat(mapped_index_list)
    return gfs_kind
        


def gen_axes(date_str):
    original_date = datetime.strptime(date_str, '%Y%m%d')
    formatted_date_one = original_date.strftime('%Y-%m-%dT03:00')
    # Add two days for the second date and format it
    date_two = original_date + timedelta(days=2)
    formatted_date_two = date_two.strftime('%Y-%m-%dT00:00')
    axes = [
    pd.Index(
        [
            pd.timedelta_range(start="0 hours", end="3 hours", freq="3h", closed="right", name="3 hour"),
        ],
        name="step"
    ),
    pd.date_range(formatted_date_one, formatted_date_two, freq="3H", name="valid_time")]
    return axes



