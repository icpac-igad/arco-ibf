# ARCO and CNO downloading of GEFS 

The script is based on Kerchunk, Xarray, Zarr lazy loading of GEFS datasets using [coiled](https://www.coiled.io/) 
in AWS open data as cloud objects at https://registry.opendata.aws/noaa-gefs/. Uses Coiled python library for AWS compute resource
creation and uses dask clusters and functions. The script main.py does the operation of kerchunk every 6 hour updated
grib files and create xarray dataset in lazy loaded forms.

The script also does stamp map plot of percipition variable, probablistic extreme rainfall using improver library
and Latex based PDF file generation.   
