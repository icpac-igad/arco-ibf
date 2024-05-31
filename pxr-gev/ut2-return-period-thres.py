#produced by greptile
import xarray as xr
from pxr_examples import gev_quantile

# Load your dataset containing the GEV parameters
ds = xr.open_dataset('path_to_your_gev_params_dataset.nc')

# Define the return period (e.g., 20 years)
return_period = 20

# Extract the GEV parameters
loc = ds['location']
scale = ds['scale']
shape = ds['shape']

# Calculate the quantile for the given return period
intensity = gev_quantile(return_period, loc, scale, shape)

# Save the result to a new NetCDF file
intensity.to_netcdf('intensity_20_year_return_period.nc')

print("Intensity for 20-year return period calculated and saved to 'intensity_20_year_return_period.nc'")
