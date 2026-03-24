# SSH - only your IP
resource "google_compute_firewall" "allow_ssh" {
  name    = "zynk-allow-ssh"
  network = "default"
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  source_ranges = [var.your_ip]
  target_tags   = ["zynk-backend"]
}

# HTTP - needed for Let's Encrypt certificate challenge
resource "google_compute_firewall" "allow_http" {
  name    = "zynk-allow-http"
  network = "default"
  allow {
    protocol = "tcp"
    ports    = ["80"]
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["zynk-backend"]
}

# HTTPS - public traffic goes through here only
resource "google_compute_firewall" "allow_https" {
  name    = "zynk-allow-https"
  network = "default"
  allow {
    protocol = "tcp"
    ports    = ["443"]
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["zynk-backend"]
}