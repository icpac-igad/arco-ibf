## config files for download information

import numpy as np

config = {
    "time_beg": "2021-02-18",
    "time_end": "2023-01-01",
    "runs": ["00"],
    "lead_times": np.arange(30,175, 3),
    "prefix": "global-forecast-system",
    "model": "gfs",
    "out_path": "/network/group/aopp/predict/TIP022_NATH_GFSAIMOD/",
    "var_names": [
        "Convective available potential energy",
        "Convective precipitation (water)",
        "Medium cloud cover",
        "Surface pressure",
        "Upward short-wave radiation flux",
        "Downward short-wave radiation flux",
        "2 metre temperature",
        "Cloud water",
        "Precipitable water",
        "Ice water mixing ratio",
        "Cloud mixing ratio",
        "Rain mixing ratio",
        "Total Precipitation",
        "U component of wind",
        "V component of wind",
    ],
    "var_levels": [
        "surface",
        "surface",
        "middleCloudLayer",
        "surface",
        "surface",
        "surface",
        "heightAboveGround",
        "atmosphereSingleLayer",
        "atmosphereSingleLayer",
        "isobaricInhPa",
        "isobaricInhPa",
        "isobaricInhPa",
        "surface",
        "isobaricInhPa",
        "isobaricInhPa",
    ],
}


def get():
    return config
