# Coiled setup with service account 

## Metadata
- **Date**: 2024-05-08
- **Tags**: #tag1 #tag2 #tag3
- **Author**: nishadhka

## Major service account- cluster
Setting up the coiled manual setup for GCP using service account [following](https://docs.coiled.io/user_guide/setup/gcp/manual.html)

1. to enable reqeuried services 
```
gcloud services enable compute
gcloud services enable bigquery.googleapis.com
gcloud services enable logging
gcloud services enable monitoring

```

```
gcloud config get-value project
coiled setup gcp --export role
```

2. To setup the service account

```
gcloud iam roles create aTCoiled --project solid-facility-417612 --file=coiled-role.yaml

gcloud iam service-accounts create aTCoiled

# replace my-project-id with your Google Cloud project ID
gcloud projects add-iam-policy-binding solid-facility-417612 \
  --member=serviceAccount:aTCoiled@solid-facility-417612.iam.gserviceaccount.com
  --role=projects/solid-facility-417612/roles/aTCoiled
```

3. to get the service-accounts key
```
gcloud iam service-accounts keys create aTCoiled-key.json \
  --iam-account aTCoiled@solid-facility-417612.iam.gserviceaccount.com
```

## service-accounts for data access

```
coiled setup gcp --export data-role

gcloud iam roles create aTCoiled_data --project solid-facility-417612 --file=coiled-data-role.yaml

gcloud iam service-accounts create aTCoiled-data

# replace my-project-id with your Google Cloud project ID
gcloud projects add-iam-policy-binding solid-facility-417612 /
  --member=serviceAccount:aTCoiled-data@solid-facility-417612.iam.gserviceaccount.com /
  --role=projects/solid-facility-417612/roles/aTCoiled_data
```

## Check for the current account

```
import coiled
coiled.list_user_information() 
```
