#produced by greptile
import xarray as xr
import numpy as np
from ev_fit import gev_pwm, ecdf

# Load your dataset
ds = xr.open_dataset('path_to_your_dataset.nc')

# Ensure the dataset has the 'spi4' variable
if 'spi4' not in ds:
    raise ValueError("Dataset does not contain 'spi4' variable")

# Calculate annual maxima for 'spi4'
annual_max = ds['spi4'].resample(time='1Y').max(dim='time')

# Rank the annual maxima
rank = annual_max.rank(dim='time', pct=False)

# Calculate the empirical cumulative distribution function (ECDF)
n_obs = annual_max.count(dim='time')
ecdf_values = ecdf(rank, n_obs)

# Fit the GEV distribution using the Method of Probability-Weighted Moments (PWM)
loc, scale, shape = gev_pwm(annual_max.values, ecdf_values.values, n_obs.values, ax_year=0)

# Create a new xarray Dataset to store the GEV parameters
gev_params = xr.Dataset(
    {
        'location': (['lat', 'lon'], loc),
        'scale': (['lat', 'lon'], scale),
        'shape': (['lat', 'lon'], shape)
    },
    coords={
        'lat': ds['lat'],
        'lon': ds['lon']
    }
)

# Save the GEV parameters to a new NetCDF file
gev_params.to_netcdf('gev_params.nc')

print("GEV parameters calculated and saved to 'gev_params.nc'")
