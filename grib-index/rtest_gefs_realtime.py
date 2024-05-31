import os
import pandas as pd

import datatree
import pickle
import fsspec

from dotenv import load_dotenv

import dynamic_zarr_store
from utils import gefs_gcs_url_maker
from utils import gen_axes
from utils import real_time_index_maker


load_dotenv()

data_path = os.getenv("data_path")
# data_path


date = "20240502"
run = "18"
avlbl_urls = gefs_gcs_url_maker(date, run)
axes = gen_axes(date)

# Opening the pickle file in binary read mode
with open(f"{data_path}gefs_deflated_grib_tree_store.pkl", "rb") as pickle_file:
    # Loading the data from the pickle file
    deflated_gfs_grib_tree_store = pickle.load(pickle_file)

# Use the loaded data
# print(data_from_pickle)

mapping = pd.read_parquet(f"{data_path}gefs_mapping_table.parquet")
deduped_mapping = mapping.loc[~mapping["attrs"].duplicated(keep="first"), :]

day1 = real_time_index_maker(avlbl_urls, deduped_mapping)


gfs_store = dynamic_zarr_store.reinflate_grib_store(
    axes=axes,
    aggregation_type=dynamic_zarr_store.AggregationType.HORIZON,
    chunk_index=day1.loc[day1.varname.isin(["tmax", "t2m"])],
    zarr_ref_store=deflated_gfs_grib_tree_store,
)


gfs_dt = datatree.open_datatree(
    fsspec.filesystem("reference", fo=gfs_store).get_mapper(""),
    engine="zarr",
    consolidated=False,
)
gfs_dt
