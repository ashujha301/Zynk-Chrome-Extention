variable "project_id" {
  type    = string
  default = "zynk-489815"
}
 
variable "region" {
  type    = string
  default = "us-central1"
}
 
variable "zone" {
  type    = string
  default = "us-central1-a"
}
 
variable "ssh_public_key" {
  type    = string
  default = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOJy8nf6tmIzqTwRmHSiNOy85qjnsDYxsFVd0ordFrmw zynk-deploy"
}
 
variable "your_ip" {
  type    = string
  default = "157.50.191.197/32"
}
 
variable "github_repo" {
  type    = string
  default = "ashujha301/Zynk-Chrome-Extention"
}
