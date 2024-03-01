
FROM mambaorg/micromamba:latest

USER root

RUN apt-get update && apt-get install -y \
    unzip \
    curl \
    vim

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" 
RUN unzip awscliv2.zip
RUN ./aws/install
RUN rm awscliv2.zip


ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
ENV ENV_NAME="base"
ENV MAMBA_ROOT_PREFIX="/opt/conda"
ENV MAMBA_EXE="/bin/micromamba"
ARG MAMBA_USER=mambauser
ARG MAMBA_USER_ID=57439
ARG MAMBA_USER_GID=57439
ENV MAMBA_USER=$MAMBA_USER
ENV MAMBA_USER_ID=$MAMBA_USER_ID
ENV MAMBA_USER_GID=$MAMBA_USER_GID

RUN micromamba install -y -n $ENV_NAME -c conda-forge kerchunk xarray dask coiled cfgrib s3fs geopandas cartopy \
 && micromamba clean --all --yes

USER $MAMBA_USER
