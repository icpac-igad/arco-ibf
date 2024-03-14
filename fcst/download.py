import argparse
import dask
import numpy as np
import os

from gfs import utils, config, filter_data

if __name__ == "__main__":

    config = config.get()

    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", type=str, default=config['prefix'])
    parser.add_argument("--model", type=str,nargs="*", default=config['model'])
    parser.add_argument("--out", type=str, default=config['out_path'])
    parser.add_argument("--time_beg", type=str, default=config['time_beg'])
    parser.add_argument("--time_end", type=str, default=config['time_end'])
    parser.add_argument("--runs", action="store", type=str, nargs="*", default=config['runs'])
    parser.add_argument("--lead_times", action="store", type=int, nargs="*", default=config['lead_times'])
    parser.add_argument("--var_names", action="store", type=str, nargs="*", default=config['var_names'])
    parser.add_argument("--var_levels", action="store", type=str, nargs="*", default=config['var_levels'])
    

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


    dates = np.arange(time_beg, time_end, np.timedelta64(1,'D'), dtype='datetime64')

    if not os.path.exists(out_path+'/netcdf'):
        os.makedirs(out_path+'/netcdf')

    for date in dates:

        year = str(date).split('-')[0]
        month = str(date).split('-')[1]
        date = str(date).replace('-','')

        for run in runs:
            urls = utils.gefs_gcp_utl_maker(date, run, ensemble_members=lead_times, 
                       model = model, prefix = prefix)

            ## have to remove gs:// for reading as a blob
            urls = [url.replace('gs://','') for url in urls]

            if len(urls)==0:

                print('No datasets found in bucket for,', date)
                continue
            
            for var_name, var_level in zip(var_names, var_levels):
                
                dask.compute(filter_data.loop_over_url_data_retrieval(out_path, urls, prefix, var_name, var_level))
