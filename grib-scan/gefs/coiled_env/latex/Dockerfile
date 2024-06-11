
FROM mambaorg/micromamba:latest

USER root

RUN apt-get update && apt-get install -y \
    unzip \
    curl \
    vim

ARG TL_MIRROR="https://texlive.info/CTAN/systems/texlive/tlnet"
ARG TL_YEAR="2023"

# Install required packages
RUN apt-get update && apt-get install -y \
    perl \
    curl \
    fontconfig \
    libgcc1 \
    gnupg \
    wget \
    xz-utils && \
    rm -rf /var/lib/apt/lists/*

# Create a directory for TexLive installation and move there
RUN mkdir "/tmp/texlive" && cd "/tmp/texlive" && \
    wget "$TL_MIRROR/install-tl-unx.tar.gz" && \
    tar xzvf ./install-tl-unx.tar.gz && \
    ( \
        echo "selected_scheme scheme-minimal" && \
        echo "instopt_adjustpath 0" && \
        echo "tlpdbopt_install_docfiles 0" && \
        echo "tlpdbopt_install_srcfiles 0" && \
        echo "TEXDIR /opt/texlive/${TL_YEAR}" && \
        echo "TEXMFLOCAL /opt/texlive/texmf-local" && \
        echo "TEXMFSYSCONFIG /opt/texlive/${TL_YEAR}/texmf-config" && \
        echo "TEXMFSYSVAR /opt/texlive/${TL_YEAR}/texmf-var" && \
        echo "TEXMFHOME ~/.texmf" \
    ) > "/tmp/texlive.profile" && \
    "./install-tl-${TL_YEAR}"*"/install-tl" --location "$TL_MIRROR" -profile "/tmp/texlive.profile" && \
    rm -vf "/opt/texlive/${TL_YEAR}/install-tl" && \
    rm -vf "/opt/texlive/${TL_YEAR}/install-tl.log" && \
    rm -vrf /tmp/*

# Add TexLive to the PATH
ENV PATH="${PATH}:/opt/texlive/${TL_YEAR}/bin/x86_64-linux"

# Continue with the rest of your Dockerfile...


RUN tlmgr install scheme-basic

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

RUN micromamba install -y -n $ENV_NAME -c conda-forge dask coiled boto3 \
 && micromamba clean --all --yes

USER $MAMBA_USER
