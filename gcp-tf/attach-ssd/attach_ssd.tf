provider "google" {
  credentials = file("../key-nka-terraform-access.json")
  project     = "PROJECT"
  region      = "europe-west2"
}
  
resource "google_compute_attached_disk" "attach_ssd" {
  disk     = "t1-cgan-ssd-disk"
  instance = "tfrecords-cgan-store-nka"
  zone     = "europe-west2-a"
}


