# Coiled setup with service account 

## Metadata
- **Date**: 2024-05-08
- **Tags**: #tag1 #tag2 #tag3
- **Author**: nishadhka

## To install and setup micromamba

```
"${SHELL}" <(curl -L micro.mamba.pm/install.sh)
source ~/.bashrc
micromamba self-update -c conda-forge
micromamba activate
micromamba install python=3.9 pip -c conda-forge
pip install cdsapi
sudo apt install tmux 
source
```
