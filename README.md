# dify

This helm chart is based on docker-compose provided by dify

this helm is distributed with `Apache License 2.0`

## install

create your own values file , save as `values.yaml`

```yaml
global:
  host: ""
  # Change this if your ingress is exposed with port other than 443, 80, like 8080 for instance
  port: ""
  enableTLS: true
  image:
    # Change this for new Dify version
    tag: "0.7.0"
  edition: "SELF_HOSTED"
  storageType: "s3"

  #---------------------------------------------------------------------#

  # enviroment variable injestion, please refer to Dify official document
  # https://docs.dify.ai/getting-started/install-self-hosted/environments

  # the following extra configs would be injected into:
  # * frontend
  # * api
  # * worker
  extraEnvs: []

  #---------------------------------------------------------------------#
  # the following extra configs would be injected into:
  # * api
  # * worker
  extraBackendEnvs:

  # SECRET_KEY is a must, A key used to securely sign session cookies and encrypt sensitive information in the database.This variable needs to be set when starting for the first time.
  # You can use "openssl rand -base64 42" to generate a strong key.

  # read more on the readme page for secret ref
  - name: SECRET_KEY
    value: ""
  # use "kubectl create secret generic dify --from-literal=SECRET_KEY=your_secret_value" to create s secret
  # use secretRef to protect your secret
  # - name: SECRET_KEY
  #   valueFrom:
  #     secretKeyRef:
  #       name: dify
  #       key: SECRET_KEY

  - name: LOG_LEVEL
    value: "DEBUG"
```

```sh
# install it
helm repo add douban https://douban.github.io/charts/
helm upgrade dify douban/dify -f values.yaml --install --debug

kubectl get pods -A
```

Find pod start with "dify-api-", this initiate the dify postgreSQL database, execute follow command:

```sh
kubectl exec -it dify-api-5b76699958-mt868 -- flask db upgrade
```


## Upgrade

To upgrade app, change the value of `global.image.tag` to the desired version

```yaml
global:
  image:
    tag: "0.7.0"
```

Then upgrade the app with helm command

```sh
helm upgrade dify douban/dify -f values.yaml --debug
```


## To use it in Production, please configure below enviroment variable
## The configuration had been verified work on AWS with Managed Services below:
## RDS Aurora PostgreSQL provisioned and serverless
## Elasticache for Redis
## AWS Opensearch
## S3

```yaml
#---------------------------------------------------------------------#
  # PostgreSQL database
  # RDS PostgreSQL or Aurora(PostgreSQL Compatatible) Database
  - name: DB_USERNAME
    value: "postgres"
  # it is adviced to use secret to manage you sensitive info including password
  - name: DB_PASSWORD
    value: ""
  - name: DB_HOST
    value: ""
  - name: DB_PORT
    value: "5432"
  - name: DB_DATABASE
    value: dify
  
  #---------------------------------------------------------------------#
  # Vector DB
  - name: VECTOR_STORE
    value: "opensearch"
    
  - name: OPENSEARCH_HOST
    value: ""
  - name: OPENSEARCH_PORT
    value: "443"
  - name: OPENSEARCH_USER
    value: "admin"
  - name: OPENSEARCH_PASSWORD
    value: ""
  - name: OPENSEARCH_SECURE
    value: "true"

  # Dify supports different kind of vector DB, please refer to below configuration
  # https://docs.dify.ai/v/zh-hans/getting-started/install-self-hosted/environments#xiang-liang-shu-ju-ku-pei-zhi

  #- name: VECTOR_STORE 
    #value: "qdrant"

  #- name: QDRANT_URL
  #  value: "http://your_host"

  #---------------------------------------------------------------------#
  # Redis
  # Elasticache Redis configuration
  - name: REDIS_HOST
    value: ""
  - name: REDIS_PORT
    value: "6379"
  - name: REDIS_DB
    value: "1"
  #- name: REDIS_USERNAME
  #  value: ""
  - name: REDIS_PASSWORD
    value: ""
  #- name: REDIS_USE_SSL
  #  value: "true"

  #---------------------------------------------------------------------#
  # Celery Configuration
  # Using below format
  # redis://<redis_username>:<redis_password>@<redis_host>:<redis_port>/<redis_database>
  # ex: redis://host:difyai123456@redis:6379/1
  
  - name: CELERY_BROKER_URL
    value: "redis://host:6379/0"

  #---------------------------------------------------------------------# 
  # S3
  - name: S3_ENDPOINT
    value: "https://your_bucket_name.s3.your_region.amazonaws.com"
  - name: S3_BUCKET_NAME
    value: "your_bucket_name"
  - name: S3_ACCESS_KEY
    value: ""
  - name: S3_SECRET_KEY
    value: ""
  - name: S3_REGION
    value: "your_region"
```
Please consult to [dify 文档](https://docs.dify.ai/v/zh-hans/getting-started/install-self-hosted/environments) [document](https://docs.dify.ai/getting-started/install-self-hosted/environments) for more info.

Please consult to dify document if you have difficult to get dify running.
