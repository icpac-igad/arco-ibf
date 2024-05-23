import argparse
import dask
import numpy as np
import os

from gfs import utils, config, filter_data

from multiprocessing import Pool
from functools import partial

n_workers = 2


def get_date(
    date,
    runs,
    lead_times,
    model,
    prefix,
    var_names,
    var_levels,
    spec_month,
    out_path,
    https=False,
):
    year = str(date).split("-")[0]
    month = str(date).split("-")[1]
    date = str(date).replace("-", "")

    if None not in spec_month:
        if month not in [spec_m.zfill(2) for spec_m in spec_month]:
            return

    for run in runs:
        lead_time1 = str(lead_times[0]).zfill(3)
        lead_time2 = str(lead_times[-1]).zfill(3)

        if https:
            urls = utils.get_thredds_https_gfs(date, run, lead_times)
        else:
            urls = utils.gefs_gcp_utl_maker(
                date, run, ensemble_members=lead_times, model=model, prefix=prefix
            )

            ## have to remove gs:// for reading as a blob
            urls = [url.replace("gs://", "") for url in urls]
        # print(urls)
        if len(urls) == 0:
            print("No datasets found in bucket for,", date)
            continue

        for var_name, var_level in zip(var_names, var_levels):
            if os.path.exists(
                out_path
                + "netcdf/"
                + model
                + date
                + "_"
                + str(date)[-2:]
                + "_f"
                + lead_time1
                + "_f"
                + lead_time2
                + "_"
                + var_name.replace(" ", "-")
                + "_"
                + var_level
                + ".zarr"
            ):
                print("File exists, skipping")
                continue

            dask.compute(
                filter_data.loop_over_url_data_retrieval(
                    out_path, urls, prefix, var_name, var_level, https=https
                )
            )


if __name__ == "__main__":
    config = config.get()

    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", type=str, default=config["prefix"])
    parser.add_argument("--model", type=str, nargs="*", default=config["model"])
    parser.add_argument("--out", type=str, default=config["out_path"])
    parser.add_argument("--time-beg", type=str, default=config["time_beg"])
    parser.add_argument("--time-end", type=str, default=config["time_end"])
    parser.add_argument(
        "--runs", action="store", type=str, nargs="*", default=config["runs"]
    )
    parser.add_argument(
        "--lead_times",
        action="store",
        type=int,
        nargs="*",
        default=config["lead_times"],
    )
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
    parser.add_argument(
        "--spec_month", action="store", nargs="*", type=str, default=[None]
    )

    args = parser.parse_args()

    out_path = args.out
    prefix = args.bucket
    model = args.model
    time_beg = args.time_beg
    time_end = args.time_end
    runs = args.runs
    lead_times = args.lead_times
    var_names = args.var_names
    var_levels = args.var_levels
    spec_month = args.spec_month

    dates = np.arange(time_beg, time_end, np.timedelta64(1, "D"), dtype="datetime64")

    if not os.path.exists(out_path + "/grib"):
        os.makedirs(out_path + "/grib")
    if not os.path.exists(out_path + "/netcdf"):
        os.makedirs(out_path + "/netcdf")

    args = [
        (
            date,
            runs,
            lead_times,
            model,
            prefix,
            var_names,
            var_levels,
            spec_month,
            out_path,
            True,
        )
        for date in dates
    ]

    with Pool(n_workers) as pool:
        pool.starmap(get_date, args)
