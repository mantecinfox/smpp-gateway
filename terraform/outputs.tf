# Outputs do Terraform

output "vpc_id" {
  description = "ID da VPC criada"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block da VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs das subnets públicas"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs das subnets privadas"
  value       = aws_subnet.private[*].id
}

output "internet_gateway_id" {
  description = "ID do Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "load_balancer_dns" {
  description = "DNS do Load Balancer"
  value       = aws_lb.main.dns_name
}

output "load_balancer_arn" {
  description = "ARN do Load Balancer"
  value       = aws_lb.main.arn
}

output "load_balancer_zone_id" {
  description = "Zone ID do Load Balancer"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "ARN do Target Group"
  value       = aws_lb_target_group.app.arn
}

output "database_endpoint" {
  description = "Endpoint do banco de dados PostgreSQL"
  value       = aws_db_instance.postgres.endpoint
}

output "database_port" {
  description = "Porta do banco de dados PostgreSQL"
  value       = aws_db_instance.postgres.port
}

output "database_name" {
  description = "Nome do banco de dados"
  value       = aws_db_instance.postgres.db_name
}

output "database_username" {
  description = "Usuário do banco de dados"
  value       = aws_db_instance.postgres.username
}

output "redis_endpoint" {
  description = "Endpoint do Redis"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_port" {
  description = "Porta do Redis"
  value       = aws_elasticache_replication_group.redis.port
}

output "redis_arn" {
  description = "ARN do Redis"
  value       = aws_elasticache_replication_group.redis.arn
}

output "security_group_app_id" {
  description = "ID do Security Group da aplicação"
  value       = aws_security_group.app.id
}

output "security_group_database_id" {
  description = "ID do Security Group do banco de dados"
  value       = aws_security_group.database.id
}

output "security_group_redis_id" {
  description = "ID do Security Group do Redis"
  value       = aws_security_group.redis.id
}

output "route_table_public_id" {
  description = "ID da Route Table pública"
  value       = aws_route_table.public.id
}

output "route_table_private_id" {
  description = "ID da Route Table privada"
  value       = aws_route_table.private.id
}

output "availability_zones" {
  description = "Zonas de disponibilidade utilizadas"
  value       = data.aws_availability_zones.available.names
}

output "region" {
  description = "Região da AWS utilizada"
  value       = var.aws_region
}

output "environment" {
  description = "Ambiente de deploy"
  value       = var.environment
}

output "project_name" {
  description = "Nome do projeto"
  value       = var.project_name
}

# Outputs condicionais
output "cloudfront_distribution_id" {
  description = "ID da distribuição CloudFront"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.main[0].id : null
}

output "cloudfront_domain_name" {
  description = "Nome do domínio CloudFront"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.main[0].domain_name : null
}

output "s3_bucket_id" {
  description = "ID do bucket S3"
  value       = var.enable_s3 ? aws_s3_bucket.main[0].id : null
}

output "s3_bucket_arn" {
  description = "ARN do bucket S3"
  value       = var.enable_s3 ? aws_s3_bucket.main[0].arn : null
}

output "efs_file_system_id" {
  description = "ID do sistema de arquivos EFS"
  value       = var.enable_efs ? aws_efs_file_system.main[0].id : null
}

output "efs_dns_name" {
  description = "Nome DNS do EFS"
  value       = var.enable_efs ? aws_efs_file_system.main[0].dns_name : null
}

output "certificate_arn" {
  description = "ARN do certificado SSL"
  value       = var.enable_certificate_manager ? aws_acm_certificate.main[0].arn : var.certificate_arn
}

output "domain_name" {
  description = "Nome do domínio"
  value       = var.domain_name
}

# Outputs de monitoramento
output "cloudwatch_log_group_name" {
  description = "Nome do grupo de logs CloudWatch"
  value       = var.enable_monitoring ? aws_cloudwatch_log_group.main[0].name : null
}

output "cloudwatch_dashboard_url" {
  description = "URL do dashboard CloudWatch"
  value       = var.enable_monitoring ? "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${var.project_name}-dashboard" : null
}

# Outputs de segurança
output "waf_web_acl_arn" {
  description = "ARN do Web ACL do WAF"
  value       = var.enable_waf ? aws_wafv2_web_acl.main[0].arn : null
}

output "shield_protection_id" {
  description = "ID da proteção Shield"
  value       = var.enable_shield ? aws_shield_protection.main[0].id : null
}

# Outputs de backup
output "backup_vault_arn" {
  description = "ARN do cofre de backup"
  value       = var.enable_efs_backup ? aws_backup_vault.main[0].arn : null
}

output "backup_plan_arn" {
  description = "ARN do plano de backup"
  value       = var.enable_efs_backup ? aws_backup_plan.main[0].arn : null
}

# Outputs de auto scaling
output "autoscaling_group_name" {
  description = "Nome do grupo de auto scaling"
  value       = var.enable_autoscaling ? aws_autoscaling_group.main[0].name : null
}

output "autoscaling_group_arn" {
  description = "ARN do grupo de auto scaling"
  value       = var.enable_autoscaling ? aws_autoscaling_group.main[0].arn : null
}

# Outputs de instâncias spot
output "spot_fleet_request_id" {
  description = "ID da requisição de frota spot"
  value       = var.enable_spot_instances ? aws_spot_fleet_request.main[0].id : null
}

# Outputs de grupos de posicionamento
output "placement_group_name" {
  description = "Nome do grupo de posicionamento"
  value       = var.enable_placement_groups ? aws_placement_group.main[0].name : null
}

# Outputs de conectividade
output "vpn_gateway_id" {
  description = "ID do VPN Gateway"
  value       = var.enable_vpn_gateway ? aws_vpn_gateway.main[0].id : null
}

output "vpn_connection_id" {
  description = "ID da conexão VPN"
  value       = var.enable_vpn_gateway ? aws_vpn_connection.main[0].id : null
}

# Outputs de logs
output "vpc_flow_logs_id" {
  description = "ID dos VPC Flow Logs"
  value       = var.enable_flow_logs ? aws_flow_log.main[0].id : null
}

output "cloudtrail_arn" {
  description = "ARN do CloudTrail"
  value       = var.enable_cloudtrail ? aws_cloudtrail.main[0].arn : null
}

# Outputs de compliance
output "config_configuration_recorder_arn" {
  description = "ARN do gravador de configuração do Config"
  value       = var.enable_config ? aws_config_configuration_recorder.main[0].arn : null
}

output "guardduty_detector_id" {
  description = "ID do detector GuardDuty"
  value       = var.enable_guardduty ? aws_guardduty_detector.main[0].id : null
}

output "security_hub_hub_arn" {
  description = "ARN do Security Hub"
  value       = var.enable_security_hub ? aws_securityhub_account.main[0].arn : null
}

output "inspector_assessment_target_arn" {
  description = "ARN do alvo de avaliação do Inspector"
  value       = var.enable_inspector ? aws_inspector_assessment_target.main[0].arn : null
}