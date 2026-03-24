resource "google_artifact_registry_repository" "zynk" {
  location      = var.region
  repository_id = "zynk-backend"
  description   = "Zynk backend Docker images"
  format        = "DOCKER"
 
  cleanup_policies {
    id     = "keep-last-3"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }
}
