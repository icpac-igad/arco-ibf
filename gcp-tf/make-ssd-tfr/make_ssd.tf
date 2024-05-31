provider "google" {
  credentials = file("key.json")
  project     = "PROJECTNAME"
  region      = "europe-west2"
}

resource "google_compute_disk" "ssd_disk" {
  name    = "t1-cgan-ssd-disk"
  type    = "pd-ssd"
  zone    = "europe-west2-b"
  size    = 50 # Size in GB
}

resource "google_compute_attached_disk" "attach_ssd" {
  disk     = google_compute_disk.ssd_disk.id
  instance = "tfrecords-cgan-store"
  zone     = "europe-west2-b"
}


output "ssd_disk_id" {
  value = google_compute_disk.ssd_disk.id
  description = "The ID of the created SSD disk"
}
