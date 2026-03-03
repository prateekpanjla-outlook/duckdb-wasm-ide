# GCP Deployment Architecture Diagram

## Overall Architecture

```mermaid
flowchart TB
    subgraph GitHub
        GH[GitHub Repository<br/>prateekpanjla-outlook/duckdb-wasm-ide]
        Branch[gcp-deployment branch]
        GH --> Branch
    end

    subgraph GCP["Google Cloud Platform"]
        subgraph CI-CD["CI/CD Pipeline"]
            CBT[Cloud Build Trigger<br/>watches gcp-deployment branch]
            CB[Cloud Build<br/>build & deploy]
            CBT --> CB
        end

        subgraph Container["Container Registry"]
            AR[Artifact Registry<br/>duckdb-ide-repo<br/>us-central1]
        end

        subgraph Compute["Compute"]
            CR[Cloud Run<br/>duckdb-ide<br/>Port: 8080<br/>cloud-run-sa]
        end

        subgraph Database["Database"]
            CS[Cloud SQL<br/>duckdb-ide-db<br/>PostgreSQL 15]
            DB[(duckdb_ide database)]
        end

        subgraph Serverless["Serverless Functions"]
            CF[Cloud Function<br/>db-init-service<br/>db-init-sa]
        end

        subgraph Secrets["Secret Management"]
            SM[Secret Manager]
            S1[db-password]
            S2[jwt-secret]
            SM --> S1
            SM --> S2
        end

        subgraph IAM["Service Accounts & IAM"]
            SA1[cloud-build-deployer-sa]
            SA2[cloud-run-sa]
            SA3[db-init-sa]
        end
    end

    subgraph Client["External Access"]
        User[End Users<br/>Browser]
    end

    %% Data flows
    Branch -->|push code| CBT
    CB -->|build docker image| AR
    CB -->|deploy| CR
    CR -->|connect via Unix socket| CS
    CF -->|init tables & seed| CS
    CS --> DB

    %% Secret access
    CR -.->|access| S1
    CR -.->|access| S2
    CF -.->|access| S1

    %% Service account usage
    CB -.->|impersonates| SA2
    CB -.->|impersonates| SA3
    CR -.->|uses| SA2
    CF -.->|uses| SA3

    %% External access
    User -->|HTTPS| CR
    User -.->|init DB one-time| CF

    %% Styling
    classDef github fill:#24292e,stroke:#fff,stroke-width:2px,color:#fff
    classDef gcp fill:#4285F4,stroke:#fff,stroke-width:2px,color:#fff
    classDef ci fill:#34A853,stroke:#fff,stroke-width:2px,color:#fff
    classDef compute fill:#FBBC05,stroke:#fff,stroke-width:2px,color:#000
    classDef db fill:#EA4335,stroke:#fff,stroke-width:2px,color:#fff
    classDef secrets fill:#A142F4,stroke:#fff,stroke-width:2px,color:#fff
    classDef iam fill:#6747D1,stroke:#fff,stroke-width:2px,color:#fff
    classDef client fill:#888,stroke:#fff,stroke-width:2px,color:#fff

    class GH,Branch github
    class CBT,CB,AR ci
    class CR compute
    class CS,DB,CF db
    class SM,S1,S2 secrets
    class SA1,SA2,SA3 iam
    class User client
```

---

## Deployment Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant CBT as Cloud Build Trigger
    participant CB as Cloud Build
    participant AR as Artifact Registry
    participant CR as Cloud Run
    participant CS as Cloud SQL
    participant CF as db-init Function
    participant SM as Secret Manager

    Note over Dev,SM: One-Time Setup (Terraform)
    Dev->>CBT: terraform apply
    activate CBT
    CBT->>AR: Create repository
    CBT->>CS: Create instance & database
    CBT->>SM: Create secrets
    CBT->>CBT: Create service accounts
    deactivate CBT

    Note over Dev,SM: Database Initialization
    Dev->>CF: gcloud functions deploy
    CF->>SM: Get db-password
    CF->>CS: Connect & create tables
    CF->>CS: Seed initial data

    Note over Dev,SM: Application Deployment
    Dev->>GH: git push to gcp-deployment
    GH->>CBT: Trigger webhook
    CBT->>CB: Start build
    CB->>CB: docker build
    CB->>AR: docker push
    CB->>CR: gcloud run deploy
    CR->>SM: Get secrets
    CR->>CS: Connect to database

    Note over Dev,SM: Runtime
    User->>CR: HTTPS request
    CR->>CS: Query database
    CS->>CR: Return data
    CR->>User: Response
```

---

## IAM Permissions Flow

```mermaid
flowchart LR
    subgraph Permissions["IAM Permissions Matrix"]
        direction TB

        CB[Cloud Build<br/>cloud-build-deployer-sa]
        CR[Cloud Run<br/>cloud-run-sa]
        CF[Cloud Function<br/>db-init-sa]

        subgraph CB_Perms["Cloud Build Permissions"]
            CB1[roles/run.developer]
            CB2[roles/cloudfunctions.developer]
            CB3[roles/artifactregistry.writer]
            CB4[roles/iam.serviceAccountUser<br/>impersonate SA]
        end

        subgraph CR_Perms["Cloud Run Permissions"]
            CR1[roles/cloudsql.client]
            CR2[roles/secretmanager.secretAccessor]
        end

        subgraph CF_Perms["Cloud Function Permissions"]
            CF1[roles/cloudsql.client]
            CF2[roles/secretmanager.secretAccessor]
        end
    end

    CB --> CB_Perms
    CR --> CR_Perms
    CF --> CF_Perms
```

---

## Network Connectivity

```mermaid
flowchart TB
    subgraph External["Internet"]
        User[Public Internet]
    end

    subgraph GCP["Google Cloud VPC"]
        subgraph Public["Public Facing Services"]
            LB[Cloud Run Load Balancer<br/>HTTPS]
            CF[Cloud Function<br/>HTTPS]
        end

        subgraph Private["Private Network"]
            CS[Cloud SQL<br/>Private IP only]
            VPC[VPC Connector]
        end
    end

    User -->|HTTPS| LB
    User -.->|HTTPS one-time| CF
    LB -->|Cloud Run Service| VPC
    CF -->|VPC Connector| VPC
    VPC -->|Unix Socket| CS

    classDef public fill:#4CAF50,stroke:#fff,stroke-width:2px,color:#fff
    classDef private fill:#f44336,stroke:#fff,stroke-width:2px,color:#fff
    classDef external fill:#2196F3,stroke:#fff,stroke-width:2px,color:#fff

    class LB,CF public
    class CS,VPC private
    class User external
```

---

## File Structure & Resources

```mermaid
graph TD
    Root[duckdb-wasm-project]

    Root --> TF[terraform/first-time-deployment]
    Root --> CF[server/cloud-functions/db-init]
    Root --> CB[cloudbuild.yaml]
    Root --> DF[Dockerfile]

    TF --> TF_main[main.tf]
    TF --> TF_vars[variables.tf]
    TF --> TF_out[outputs.tf]
    TF --> TF_key[terraform-key.json]

    CF --> CF_idx[index.js]
    CF --> CF_mig[migrate.js]
    CF --> CF_seed[seed.js]

    style Root fill:#4285F4,stroke:#fff,color:#fff
    style TF fill:#34A853,stroke:#fff,color:#fff
    style CF fill:#FBBC05,stroke:#fff,color:#000
    style CB fill:#EA4335,stroke:#fff,color:#fff
    style DF fill:#A142F4,stroke:#fff,color:#fff
```

---

## Terraform State Flow

```mermaid
stateDiagram-v2
    [*] --> NotInitialized: Project created
    NotInitialized --> AuthSetup: setup-auth.sh
    AuthSetup --> ReadyForInit: terraform-key.json created
    ReadyForInit --> Initialized: terraform init
    Initialized --> Planned: terraform plan
    Planned --> Applied: terraform apply
    Applied --> ResourcesCreated: GCP resources provisioned
    ResourcesCreated --> DeployReady: Ready for Cloud Build

    note right of AuthSetup
        Service Account Created
        IAM Permissions Granted
        Key Downloaded
    end note

    note right of ResourcesCreated
        APIs Enabled
        Artifact Registry
        Cloud SQL Instance
        Secret Manager Secrets
        Service Accounts
    end note
```
