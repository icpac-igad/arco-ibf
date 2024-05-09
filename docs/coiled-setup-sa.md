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

To setup the service account

```
gcloud iam roles create aTCoiled --project solid-facility-417612 --file=coiled-role.yaml

gcloud iam service-accounts create aTCoiled

# replace my-project-id with your Google Cloud project ID
gcloud projects add-iam-policy-binding solid-facility-417612 \
  --member=serviceAccount:aTCoiled@solid-facility-417612.iam.gserviceaccount.com
  --role=projects/solid-facility-417612/roles/aTCoiled
```

to get the service-accounts key
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

- Objective 1
- Objective 2
- Objective 3

## Key Points
### Key Point 1
Describe the first key point here. Include any relevant details, links, or thoughts.

### Key Point 2
Discuss the second key point. You can add lists, quotes, or code snippets as needed.

### Key Point 3
Explanation of the third key point. Remember to structure information in a way that is easy to read and understand.

## Questions and Answers
- **Q1**: What is the first question?
  - **A1**: Here is the answer to the first question.
- **Q2**: What is the second question?
  - **A2**: Here is the answer to the second question.

## References and Links
1. [Reference Title 1](URL)
2. [Reference Title 2](URL)

## Tasks
- [ ] Task 1 to be completed
- [ ] Task 2 to be completed
- [x] Task 3 already completed (mark tasks that are done with an 'x')

## Additional Notes
Include any additional thoughts or observations here. You can also link to other notes within your Obsidian vault like so: [[Linked Note Title]]
