provider "google" {
  credentials = file("../key-nka-terraform-access.json")
  project     = "PROJECTID"
  region      = "europe-west2"
}

resource "google_compute_instance" "vm_instance" {
  name         = "tfrecords-cgan-store-nka-t2"
  machine_type = "g2-standard-8"
  zone         = "europe-west2-a"

  boot_disk {
    initialize_params {
      image = "projects/deeplearning-platform-release/global/images/tf-ent-2-15-cu121-v20240417-debian-11-py310"
    }
  }

  scheduling {
    on_host_maintenance = "TERMINATE"
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
