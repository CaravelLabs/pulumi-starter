import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as insights from "@pulumi/azure-native/insights";
import * as web from "@pulumi/azure-native/web";
import * as documentdb from "@pulumi/azure-native/documentdb";
import { PartitionKind } from "@pulumi/azure-native/documentdb";

// For consistency and convenience
const projectName = pulumi.getProject();
const environment = pulumi.getStack();

// For available options https://docs.microsoft.com/en-us/cli/azure/appservice/plan?view=azure-cli-latest#az_appservice_plan_create
const webSize = "B1";
const webTier = "Basic";

//Create an Azure Resource Group
const resourceGroup = new resources.ResourceGroup(
  `${projectName}-${environment}-rg`,
  { resourceGroupName: `${projectName}-${environment}-rg` }
);

// Create an Azure resource (Storage Account)
const storageAccount = new storage.StorageAccount(
  `${projectName.replace('-', '')}${environment}sa`,
  {
    accountName: `${projectName.replace('-', '')}${environment}sa`,
    resourceGroupName: resourceGroup.name,
    sku: {
      name: storage.SkuName.Standard_LRS,
    },
    kind: storage.Kind.StorageV2,
  }
);

// Build the connection string
const storageConnectionString = getConnectionString(
  resourceGroup.name,
  storageAccount.name
);

// Create Azure Application Insights resource
const appInsights = new insights.Component(`${projectName}-${environment}-ai`, {
  resourceName: `${projectName}-${environment}-ai`,
  resourceGroupName: resourceGroup.name,
  kind: "web",
  applicationType: insights.ApplicationType.Web,
});

export const appInsightInstrumentationKey = appInsights.instrumentationKey;

// Create Azure App Service Project resource
const appServicePlan = new web.AppServicePlan(
  `${projectName}-${environment}-asp`,
  {
    name: `${projectName}-${environment}-asp`,
    resourceGroupName: resourceGroup.name,
    kind: "linux",
    reserved: true,
    sku: {
      name: webSize,
      tier: webTier,
    },
  }
);

// Create CosmosDB Account
const cosmosDbAccount = new documentdb.DatabaseAccount(
  `${projectName}-${environment}-cdb`,
  {
    accountName: `${projectName}-${environment}-cdb`,
    resourceGroupName: resourceGroup.name,
    databaseAccountOfferType: documentdb.DatabaseAccountOfferType.Standard,
    locations: [
      {
        locationName: resourceGroup.location,
        failoverPriority: 0,
      },
    ],
    consistencyPolicy: {
      defaultConsistencyLevel: documentdb.DefaultConsistencyLevel.Session,
    },
  }
);

const accountKeys = pulumi
  .all([cosmosDbAccount.name, resourceGroup.name])
  .apply(([cosmosdbAccountName, resourceGroupName]) =>
    documentdb.listDatabaseAccountKeys({
      accountName: cosmosdbAccountName,
      resourceGroupName: resourceGroupName,
    })
  );

// Create CosmosDB Database
const db = new documentdb.SqlResourceSqlDatabase(
  `${projectName}-${environment}-db`,
  {
    databaseName: `${projectName}-${environment}-db`,
    resourceGroupName: resourceGroup.name,
    accountName: cosmosDbAccount.name,
    resource: {
      id: `${projectName}-${environment}-db`,
    },
    options: {
      throughput: 400,
    },
  }
);

// To add additional containers follow below patter as needed
const usersContainer = new documentdb.SqlResourceSqlContainer("users", {
  accountName: cosmosDbAccount.name,
  databaseName: db.name,
  containerName: "users",
  resourceGroupName: resourceGroup.name,
  resource: {
    id: "users",
    partitionKey: {
      kind: PartitionKind.Hash,
      paths: ["/id"],
    },
  },
});

// Create Azure WebApp resource with custom app settings
const app = new web.WebApp(`${projectName}-${environment}-web`, {
  name: `${projectName}-${environment}-web`,
  resourceGroupName: resourceGroup.name,
  serverFarmId: appServicePlan.id,
  siteConfig: {
    appSettings: [
      {
        name: "APPINSIGHTS_INSTRUMENTATIONKEY",
        value: appInsights.instrumentationKey,
      },
      {
        name: "APPLICATIONINSIGHTS_CONNECTION_STRING",
        value: pulumi.interpolate`InstrumentationKey=${appInsights.instrumentationKey}`,
      },
      {
        name: "APPLICATIONINSIGHTS_ROLENAME",
        value: `${projectName}-${environment}-web`,
      },
      { name: "ApplicationInsightsAgent_EXTENSION_VERSION", value: "~2" },
      { name: "COSMOSDB_ENDPOINT", value: cosmosDbAccount.documentEndpoint },
      { name: "COSMOSDB_KEY", value: accountKeys.primaryMasterKey },
      { name: "DATABASE_NAME", value: db.name },
      { name: "COSMOSDB_USERS_CONTAINER", value: usersContainer.name },
    ],
  },
});

export const webAppName = app.name;

// Create Azure Functions resource
const functionsApp = new web.WebApp(`${projectName}-${environment}-func`, {
  name: `${projectName}-${environment}-func`,
  resourceGroupName: resourceGroup.name,
  serverFarmId: appServicePlan.id,
  kind: "functionapp",
  siteConfig: {
    appSettings: [
      { name: "AzureWebJobsStorage", value: storageConnectionString },
      { name: "FUNCTIONS_EXTENSION_VERSION", value: "~3" },
      { name: "FUNCTIONS_WORKER_RUNTIME", value: "node" },
      { name: "WEBSITE_NODE_DEFAULT_VERSION", value: "~14" },
      {
        name: "APPINSIGHTS_INSTRUMENTATIONKEY",
        value: appInsights.instrumentationKey,
      },
      {
        name: "APPLICATIONINSIGHTS_CONNECTION_STRING",
        value: pulumi.interpolate`InstrumentationKey=${appInsights.instrumentationKey}`,
      },
      {
        name: "APPLICATIONINSIGHTS_ROLENAME",
        value: `${projectName}-${environment}-func`,
      },
      { name: "ApplicationInsightsAgent_EXTENSION_VERSION", value: "~2" },
    ],
    http20Enabled: true,
    nodeVersion: "~14",
  },
});

export const functionsAppName = functionsApp.name;

function getConnectionString(
  resourceGroupName: pulumi.Input<string>,
  accountName: pulumi.Input<string>
): pulumi.Output<string> {
  // Retrieve the primary storage account key.
  const storageAccountKeys = pulumi
    .all([resourceGroupName, accountName])
    .apply(([resourceGroupName, accountName]) =>
      storage.listStorageAccountKeys({ resourceGroupName, accountName })
    );
  const primaryStorageKey = storageAccountKeys.keys[0].value;

  // Build the connection string to the storage account.
  return pulumi.interpolate`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${primaryStorageKey}`;
}
