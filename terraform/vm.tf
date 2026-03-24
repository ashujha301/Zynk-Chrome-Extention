resource "google_compute_address" "static_ip" {
  name   = "zynk-static-ip"
  region = var.region
}

resource "google_compute_instance" "zynk_backend" {
  name         = "zynk-backend"
  machine_type = "e2-micro"
  zone         = var.zone
  tags         = ["zynk-backend"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30
      type  = "pd-standard"
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.static_ip.address
    }
  }

  metadata = {
    ssh-keys = "zynk:${var.ssh_public_key}"
    startup-script = <<-SCRIPT
      #!/bin/bash
      LOG=/var/log/zynk-startup.log
      touch $LOG
      chmod 644 $LOG

      echo "[startup] BEGIN $(date)" >> $LOG

      echo "[1/6] Updating apt..." >> $LOG
      apt-get update -y >> $LOG 2>&1

      echo "[2/6] Installing base deps..." >> $LOG
      apt-get install -y ca-certificates curl gnupg lsb-release >> $LOG 2>&1

      echo "[3/6] Adding Docker GPG key..." >> $LOG
      install -m 0755 -d /etc/apt/keyrings >> $LOG 2>&1
      curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg >> $LOG 2>&1
      chmod a+r /etc/apt/keyrings/docker.gpg >> $LOG 2>&1

      echo "[4/6] Adding Docker repo..." >> $LOG
      ARCH=$(dpkg --print-architecture)
      CODENAME=$(lsb_release -cs)
      echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $CODENAME stable" > /etc/apt/sources.list.d/docker.list
      echo "repo added: $ARCH $CODENAME" >> $LOG

      echo "[5/6] Installing Docker..." >> $LOG
      apt-get update -y >> $LOG 2>&1
      apt-get install -y docker-ce docker-ce-cli containerd.io >> $LOG 2>&1

      echo "[6/6] Setting up zynk user..." >> $LOG
      useradd -m -s /bin/bash zynk >> $LOG 2>&1 || true
      usermod -aG docker zynk >> $LOG 2>&1
      mkdir -p /home/zynk/app >> $LOG 2>&1
      chown -R zynk:zynk /home/zynk/app >> $LOG 2>&1

      echo "[optional] Installing gcloud..." >> $LOG
      curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg >> $LOG 2>&1 || echo "[warn] gcloud gpg failed, skipping" >> $LOG
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list
      apt-get update -y >> $LOG 2>&1 && apt-get install -y google-cloud-cli >> $LOG 2>&1 || echo "[warn] gcloud install failed, skipping" >> $LOG

      echo "[startup] DONE $(date)" >> $LOG
    SCRIPT
  }

  service_account {
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  depends_on = [google_compute_address.static_ip]
}