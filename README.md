## Toward ARCO-Based IBF with Cloud Native Operations

This repository hosts Python-based workflows for operationalizing **Impact-Based Forecasting (IBF)** using **Cloud Native Operations (CNO)** and the **ARCO** data format. The workflows align with methodologies presented in [DOI:10.13140/RG.2.2.36634.41928](https://doi.org/10.13140/RG.2.2.36634.41928), focusing on cost-effective and scalable daily/weekly/monthly IBF product generation for Disaster Risk Management (DRM).

The repository adopts DevOps principles and supports operational deployment using scalable cloud infrastructure. Components are structured to reflect the full IBF pipeline:

* **`events/`** — Routines for generating event-based climate storylines and identifying historical extremes
* **`fcst/`** — Scripts for downloading and handling EPS forecast products (e.g., GEFS, ECMWF)
* **`obs/`** — Routines to collect observational datasets
* **`haz/`** — Scripts and inputs for running hazard models (hydrological/hydrodynamic models for flood and drought)
* **`imp/`** — Impact modeling routines: exposure, vulnerability, CLIMADA-based impact calculation
* **`verify/`** — Forecast verification workflows
* **`bn/`** — Bayesian Network-based risk and decision analysis routines for traffic-light IBF matrices

**Hazard Modeling, Impact Estimation, and Climate Storylines for Drought and Flood Disasters in Eastern Africa**
This project aims to enhance the East Africa Hazard Watch Portal as a decision-support and actionable information tool for Disaster Risk Management (DRM). It uses impact-based forecasting grounded in a chain of **auditable evidence** synthesized from **event-based climate storylines**. Supported by CRAF'D. 

A key deliverables in this project is the use of **ARCO** datasets — **Analysis-Ready, Cloud-Optimized** formats — to streamline the IBF workflow. Combined with **Cloud Native Operations (CNO)**, this allows for highly scalable, efficient, and cost-effective IBF product generation that supports early action decision-making at regional and local levels.

---

## Branches and Their Purpose

The repository includes several development branches targeting specific components, experiments, or deployments:

* [`flask-wgl`](https://github.com/icpac-igad/arco-ibf/tree/flask-wgl):
  Web application using Flask and WeatherLayersGL to visualize COG data.

* [`gcp-run`](https://github.com/icpac-igad/arco-ibf/tree/gcp-run):
  Kerchunk-based pipeline to run GEFS forecasts from AWS using GCP. The kerchunk is moved into seperate repo [grib-index-kerchunk](https://github.com/icpac-igad/grib-index-kerchunk)

* [`gcs_processing`](https://github.com/icpac-igad/arco-ibf/tree/gcs_processing):
  IMERG rainfall data processing. *(Note: Now migrated to [DevOps-hazard-modeling](https://github.com/icpac-igad/DevOps-hazard-modeling))*.

* [`shruti_branch`](https://github.com/icpac-igad/arco-ibf/tree/shruti_branch):
  Development for the SEWAA project (drought and flood risk).

* [`tipg`](https://github.com/icpac-igad/arco-ibf/tree/tipg):
  Vector tile server using [eoAPI](https://github.com/developmentseed/eoAPI), deployed via Replit agent for StoryMaps and AA verification (E4DRR project).

* [`titiler-pgstac`](https://github.com/icpac-igad/arco-ibf/tree/titiler-pgstac):
  Replit deployment of Titiler with PgSTAC integration for STAC browsing and COG tiling, supporting StoryMaps deliverables.

* [`monty-stac`](https://github.com/icpac-igad/arco-ibf/tree/monty-stac):
  Exploratory branch using the MONTY STAC catalog for East Africa, contributing to the impact catalog goals of the E4DRR project.

---

## Project Funding and Partners

This work is funded by the **United Nations | Complex Risk Analytics Fund (CRAF’d)**, from 2024-11.

**ICPAC and NORCAP** is the project implementation partners.


