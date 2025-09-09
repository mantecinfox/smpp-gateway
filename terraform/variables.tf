# Variáveis do Terraform

variable "aws_region" {
  description = "Região da AWS onde os recursos serão criados"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Ambiente de deploy (dev, staging, prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "O ambiente deve ser dev, staging ou prod."
  }
}

variable "project_name" {
  description = "Nome do projeto"
  type        = string
  default     = "smpp-admin"
}

variable "db_password" {
  description = "Senha do banco de dados PostgreSQL"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Senha do Redis"
  type        = string
  sensitive   = true
  default     = ""
}

variable "instance_type" {
  description = "Tipo de instância EC2"
  type        = string
  default     = "t3.micro"
}

variable "db_instance_class" {
  description = "Classe da instância do banco de dados"
  type        = string
  default     = "db.t3.micro"
}

variable "redis_node_type" {
  description = "Tipo do nó do Redis"
  type        = string
  default     = "cache.t3.micro"
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks permitidos para acesso"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "backup_retention_days" {
  description = "Dias de retenção do backup do banco"
  type        = number
  default     = 7
}

variable "enable_encryption" {
  description = "Habilitar criptografia nos recursos"
  type        = bool
  default     = true
}

variable "enable_monitoring" {
  description = "Habilitar monitoramento detalhado"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags adicionais para os recursos"
  type        = map(string)
  default     = {}
}

variable "vpc_cidr" {
  description = "CIDR block da VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks das subnets públicas"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks das subnets privadas"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}

variable "availability_zones" {
  description = "Zonas de disponibilidade a serem usadas"
  type        = list(string)
  default     = []
}

variable "enable_nat_gateway" {
  description = "Habilitar NAT Gateway para subnets privadas"
  type        = bool
  default     = false
}

variable "enable_vpn_gateway" {
  description = "Habilitar VPN Gateway"
  type        = bool
  default     = false
}

variable "enable_flow_logs" {
  description = "Habilitar VPC Flow Logs"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Dias de retenção dos logs"
  type        = number
  default     = 30
}

variable "enable_cloudtrail" {
  description = "Habilitar AWS CloudTrail"
  type        = bool
  default     = false
}

variable "enable_config" {
  description = "Habilitar AWS Config"
  type        = bool
  default     = false
}

variable "enable_guardduty" {
  description = "Habilitar AWS GuardDuty"
  type        = bool
  default     = false
}

variable "enable_security_hub" {
  description = "Habilitar AWS Security Hub"
  type        = bool
  default     = false
}

variable "enable_inspector" {
  description = "Habilitar AWS Inspector"
  type        = bool
  default     = false
}

variable "enable_waf" {
  description = "Habilitar AWS WAF"
  type        = bool
  default     = false
}

variable "enable_shield" {
  description = "Habilitar AWS Shield"
  type        = bool
  default     = false
}

variable "enable_certificate_manager" {
  description = "Habilitar AWS Certificate Manager"
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Nome do domínio para o certificado SSL"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ARN do certificado SSL existente"
  type        = string
  default     = ""
}

variable "enable_cloudfront" {
  description = "Habilitar CloudFront para CDN"
  type        = bool
  default     = false
}

variable "enable_s3" {
  description = "Habilitar S3 para armazenamento"
  type        = bool
  default     = false
}

variable "s3_bucket_name" {
  description = "Nome do bucket S3"
  type        = string
  default     = ""
}

variable "enable_efs" {
  description = "Habilitar EFS para armazenamento compartilhado"
  type        = bool
  default     = false
}

variable "enable_efs_encryption" {
  description = "Habilitar criptografia no EFS"
  type        = bool
  default     = true
}

variable "enable_efs_backup" {
  description = "Habilitar backup automático do EFS"
  type        = bool
  default     = false
}

variable "efs_performance_mode" {
  description = "Modo de performance do EFS"
  type        = string
  default     = "generalPurpose"
  validation {
    condition     = contains(["generalPurpose", "maxIO"], var.efs_performance_mode)
    error_message = "O modo de performance deve ser generalPurpose ou maxIO."
  }
}

variable "efs_throughput_mode" {
  description = "Modo de throughput do EFS"
  type        = string
  default     = "bursting"
  validation {
    condition     = contains(["bursting", "provisioned"], var.efs_throughput_mode)
    error_message = "O modo de throughput deve ser bursting ou provisioned."
  }
}

variable "efs_provisioned_throughput" {
  description = "Throughput provisionado do EFS (em MiB/s)"
  type        = number
  default     = 100
}

variable "enable_autoscaling" {
  description = "Habilitar auto scaling"
  type        = bool
  default     = false
}

variable "min_capacity" {
  description = "Capacidade mínima do auto scaling"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Capacidade máxima do auto scaling"
  type        = number
  default     = 10
}

variable "target_cpu_utilization" {
  description = "Utilização de CPU alvo para auto scaling"
  type        = number
  default     = 70
}

variable "target_memory_utilization" {
  description = "Utilização de memória alvo para auto scaling"
  type        = number
  default     = 80
}

variable "enable_spot_instances" {
  description = "Habilitar instâncias spot"
  type        = bool
  default     = false
}

variable "spot_price" {
  description = "Preço máximo para instâncias spot"
  type        = string
  default     = "0.05"
}

variable "enable_placement_groups" {
  description = "Habilitar grupos de posicionamento"
  type        = bool
  default     = false
}

variable "placement_strategy" {
  description = "Estratégia de posicionamento"
  type        = string
  default     = "cluster"
  validation {
    condition     = contains(["cluster", "partition", "spread"], var.placement_strategy)
    error_message = "A estratégia de posicionamento deve ser cluster, partition ou spread."
  }
}