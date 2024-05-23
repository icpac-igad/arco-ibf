import argparse
import dask
import xarray as xr
import numpy as np
import os
import glob
import time

from gfs import config


# @dask.delayed
def loop_and_concat_from_dir(var_name, var_level, dir):
    var_name = var_name.replace(" ", "-")
    files = glob.glob(dir + "netcdf/*%s*.zarr" % var_name)
    start_time = time.time()
    loaded = [xr.open_dataset(file, engine="zarr") for file in files]
    print(
        "Loaded all files for %s in -----" % var_name, time.time() - start_time, "s----"
    )

    return xr.concat(loaded, "time")


if __name__ == "__main__":
    config = config.get()

    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=str, default=config["out_path"])
    parser.add_argument(
        "--var_names", action="store", type=str, nargs="*", default=config["var_names"]
    )
    parser.add_argument(
        "--var_levels",
        action="store",
        type=str,
        nargs="*",
        default=config["var_levels"],
    )
    args = parser.parse_args()

    for var_name, var_level in zip(args.var_names, args.var_levels):
        df_full = dask.compute(loop_and_concat_from_dir(var_name, var_level, args.dir))

        df_full.to_zarr(
            args.dir
            + "netcdf/"
            + var_name
            + "_"
            + var_level
            + "_complete_2021_2022.zarr"
        )
