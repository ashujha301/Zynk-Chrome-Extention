output "vm_external_ip" {
  value = google_compute_address.static_ip.address
}
 
output "artifact_registry_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.zynk.repository_id}"
}
 
output "ssh_command" {
  value = "ssh -i ~/.ssh/zynk_deploy zynk@${google_compute_address.static_ip.address}"
}
 
output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}
 
output "service_account_email" {
  value = google_service_account.github_actions.email
}
