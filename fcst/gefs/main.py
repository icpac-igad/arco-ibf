import coiled
import dask

from utils import gefs_s3_utl_maker
from utils import gen_json

from utils import xcluster_process_kc_individual
from utils import func_combine_kc
from utils import acluster_RetryPlotter
from utils import func_execute_plotting_and_stitching


# Usage example
date = "20231114"
run = "00"
results = xcluster_process_kc_individual(date, run)
results = func_combine_kc(date, run)
# # Example usage:
plotter = acluster_RetryPlotter(date, run)
plotter.run_plotter()
plotter.retry(attempt=1)
plotter.retry(attempt=2)
plotter.shutdown()
results = func_execute_plotting_and_stitching(date, run)
