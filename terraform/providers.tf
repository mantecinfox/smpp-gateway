# Configuração dos providers do Terraform

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.9"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.1"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.1"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Configuração do backend S3 (opcional)
  # backend "s3" {
  #   bucket         = "smpp-admin-terraform-state"
  #   key            = "terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "smpp-admin-terraform-locks"
  # }
}

# Configuração do provider AWS
provider "aws" {
  region = var.aws_region

  # Configurações padrão
  default_tags {
    tags = merge(
      {
        Project     = var.project_name
        Environment = var.environment
        ManagedBy   = "Terraform"
        CreatedAt   = timestamp()
      },
      var.tags
    )
  }

  # Configurações de retry
  retry_mode = "adaptive"
  max_retries = 10

  # Configurações de timeout
  http_timeout = 60

  # Configurações de logging
  log_level = "Info"
}

# Configuração do provider Random
provider "random" {
  # Configurações padrão
}

# Configuração do provider Time
provider "time" {
  # Configurações padrão
}

# Configuração do provider Null
provider "null" {
  # Configurações padrão
}

# Configuração do provider Local
provider "local" {
  # Configurações padrão
}

# Configuração do provider TLS
provider "tls" {
  # Configurações padrão
}

# Configuração do provider AWS para regiões específicas (se necessário)
# provider "aws" {
#   alias  = "us-west-2"
#   region = "us-west-2"
# }

# Configuração do provider AWS para contas específicas (se necessário)
# provider "aws" {
#   alias  = "production"
#   region = var.aws_region
#   assume_role {
#     role_arn = "arn:aws:iam::123456789012:role/TerraformRole"
#   }
# }

# Configuração do provider AWS para perfis específicos (se necessário)
# provider "aws" {
#   alias  = "dev"
#   region = var.aws_region
#   profile = "dev-profile"
# }

# Configuração do provider AWS para credenciais específicas (se necessário)
# provider "aws" {
#   alias  = "staging"
#   region = var.aws_region
#   access_key = var.aws_access_key
#   secret_key = var.aws_secret_key
# }

# Configuração do provider AWS para endpoints específicos (se necessário)
# provider "aws" {
#   alias  = "local"
#   region = var.aws_region
#   endpoints {
#     s3 = "http://localhost:4566"
#     dynamodb = "http://localhost:4566"
#   }
# }

# Configuração do provider AWS para configurações específicas (se necessário)
# provider "aws" {
#   alias  = "govcloud"
#   region = "us-gov-west-1"
#   skip_credentials_validation = true
#   skip_metadata_api_check = true
#   skip_region_validation = true
# }

# Configuração do provider AWS para configurações de segurança (se necessário)
# provider "aws" {
#   alias  = "secure"
#   region = var.aws_region
#   assume_role {
#     role_arn = "arn:aws:iam::123456789012:role/TerraformRole"
#     external_id = var.external_id
#     session_name = "TerraformSession"
#   }
# }

# Configuração do provider AWS para configurações de rede (se necessário)
# provider "aws" {
#   alias  = "network"
#   region = var.aws_region
#   vpc_endpoint {
#     service = "s3"
#     vpc_id = aws_vpc.main.id
#   }
# }

# Configuração do provider AWS para configurações de monitoramento (se necessário)
# provider "aws" {
#   alias  = "monitoring"
#   region = var.aws_region
#   cloudwatch_logs {
#     log_group_name = "/aws/lambda/terraform"
#   }
# }

# Configuração do provider AWS para configurações de backup (se necessário)
# provider "aws" {
#   alias  = "backup"
#   region = var.aws_region
#   backup_vault {
#     name = "terraform-backup-vault"
#   }
# }

# Configuração do provider AWS para configurações de disaster recovery (se necessário)
# provider "aws" {
#   alias  = "dr"
#   region = "us-west-2"
#   assume_role {
#     role_arn = "arn:aws:iam::123456789012:role/DisasterRecoveryRole"
#   }
# }