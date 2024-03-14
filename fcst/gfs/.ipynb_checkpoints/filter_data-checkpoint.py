# Python standard libraries
import os
import sys
import re
import calendar
from datetime import datetime, timedelta

# Third-party libraries
import xarray as xr
import ujson
import fsspec
import dask
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

import geopandas as gp
import cartopy.crs as ccrs



from cfgrib.xarray_store import open_dataset
import google.auth
from google.cloud import storage


def retrieve_url_data(out_path, url, prefix):

    
    client = storage.Client.create_anonymous_client()
    bucket = client.bucket(prefix, user_project=None)    
    blob = storage.Blob(url.replace(f'{prefix}/',''), bucket)
    blob.download_to_filename(filename = out_path+'/'+url.split('/')[1]+url.split('/')[-1], client=client)
    #!rm out_path+'/*.idx'

def open_and_get_variable(out_path, url, var_name, var_level):

    #print(var_level, var_name)
    df = open_dataset(\
        out_path+'/'+url.split('/')[1]+url.split('/')[-1],
        filter_by_keys={\
            'typeOfLevel': var_level,
            'name': var_name,
        }
    )

    if var_level == 'isobaricInhPa':

        df = df.sel({'isobaricInhPa':700})
    
    return df

@dask.delayed
def loop_over_url_data_retrieval(out_path, urls, prefix, var_name, var_level):

    df_all = []
    
    for url in urls:

        retrieve_url_data(out_path, url, prefix)
        df_all.append(open_and_get_variable(out_path, url, var_name, var_level))
    
    df_all = xr.concat(df_all, 'step')
    #print(df_all.step.values)

    
    date = url.split('/')[1].split('.')[1]
    model = url.split('/')[-1].split('.')[0]
    timestep = url.split('/')[-1].split('.')[1]
    lead_time1 = urls[0].split('/')[-1].split('.')[-1]
    lead_time2 = url.split('/')[-1].split('.')[-1]
    
    df_all.to_netcdf(out_path+'netcdf/'+model+date+'_'+timestep+'_'+lead_time1+'_'+lead_time2+'_'+var_name.replace(' ','-')+'_'+var_level+'.nc')
    

    