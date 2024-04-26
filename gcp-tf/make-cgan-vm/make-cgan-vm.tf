provider "google" {
  credentials = file("key.json")
  project     = "PROJECT NAME"
  region      = "europe-west2"
}


resource "google_compute_instance" "gpu_instance" {
  name         = "cgan-training-instance"
  machine_type = "n1-standard-4"
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2004-lts"
    }
  }

  network_interface {
    network = "default"
    access_config {
      // Ephemeral IP
    }
  }

  metadata_startup_script = <<-EOF
              #!/bin/bash
              # Install necessary packages
              sudo apt-get update
              sudo apt-get install -y python3-pip python3-dev

              # Install TensorFlow with GPU support
              pip3 install tensorflow-gpu

              # Install other required packages
              pip3 install numpy matplotlib jupyter
              
              # Clone the cGAN code repository (replace with your own repository)
              git clone https://github.com/your-username/cgan-repository.git
              
              # Set up Jupyter Notebook (optional)
              jupyter notebook --generate-config
              echo "c.NotebookApp.ip = '0.0.0.0'" >> ~/.jupyter/jupyter_notebook_config.py
              echo "c.NotebookApp.open_browser = False" >> ~/.jupyter/jupyter_notebook_config.py
              echo "c.NotebookApp.port = 8888" >> ~/.jupyter/jupyter_notebook_config.py
              
              # Start Jupyter Notebook (optional)
              nohup jupyter notebook &
              EOF

metadata = {
    ssh-keys = <<-EOF
    nka-cgan:${file("nka-cgan-sshkey.pub")}
    EOF
  }

  service_account {
    scopes = ["userinfo-email", "compute-ro", "storage-ro"]
  }
}

resource "google_compute_firewall" "allow_jupyter" {
  name    = "allow-jupyter"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["8888"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["cgan-training-instance"]
}
