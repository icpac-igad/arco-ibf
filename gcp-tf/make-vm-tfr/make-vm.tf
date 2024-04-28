provider "google" {
  credentials = file("key.json")
  project     = "PROJECT NAME"
  region      = "europe-west2"
}


resource "google_compute_instance" "vm_instance" {
  name         = "tfrecords-cgan-store"
  machine_type = "n2-highmem-2"
  zone         = "europe-west2-b"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
    }
  }

  network_interface {
    network = "default"
    access_config {
      // Ephemeral IP
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  service_account {
    scopes = ["userinfo-email", "compute-ro", "storage-ro"]
  }
}

