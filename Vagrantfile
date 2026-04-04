# SQL Practice Project — Development & Testing VM
# Single VM with PostgreSQL, Node.js, Python, Playwright
# No synced folders — uses git clone on native filesystem
# Usage: vagrant up && vagrant ssh

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"
  config.vm.hostname = "duckdb-ide-dev"

  # Resource allocation (half of 32GB system)
  config.vm.provider "virtualbox" do |vb|
    vb.memory = 16384
    vb.cpus = 4
    vb.name = "duckdb-ide-dev"
  end

  # Port forwarding — access services from Windows browser (guest +15)
  config.vm.network "forwarded_port", guest: 3000, host: 3015  # Express (API + static)
  config.vm.network "forwarded_port", guest: 5432, host: 5447  # PostgreSQL
  config.vm.network "forwarded_port", guest: 8080, host: 8095  # Docker container test

  # No synced folders — everything runs on native VM filesystem
  config.vm.synced_folder ".", "/vagrant", disabled: true

  # Provisioning script
  config.vm.provision "shell", path: "vagrant_provision.sh", privileged: true
end
