# Introduction

This is the infrastructure as code project for the solution that uses [Pulumi](https://www.pulumi.com/)

## Getting Started

Here's how to setup the project for first time use:

1. Installation process
   1. [Install Pulumi](https://www.pulumi.com/docs/get-started/azure/begin/#install-pulumi)
   1. [Install Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli#install)
   1. [Install dotenv-cli](https://github.com/entropitor/dotenv-cli)

_The intend of this project is to use Azure as the Pulumi backend for state management and secret provider. This pre-requisite configuration is covered in the following guideline._

## Run

Here's how to run the Pulumi script locally:

1. Create a .env file at the root of this folder with the values listed in .env.sample. These are the variables used by Pulumi to connect to Azure.
1. To run Pulumi you will need to log in to the Pulumi server, select a stack (environment) and run the script. We use the [dotenv-cli](https://github.com/entropitor/dotenv-cli) to read the values from the .env file into the Environment Variables before executing Pulumi.

   ```bash
   npm install
   dotenv pulumi login azblob://pulumistate
   dotenv pulumi stack init --secrets-provider="azurekeyvault://<key-identifier-uri-address>"
   # update PULUMI_CONFIG_PASSPHRASE environment variable
   # confirm location key is available in the Pulumi.dev.yaml
   dotenv pulumi preview # to preview changes to infrastructure
   dotenv pulumi up # to apply changes
   ```
