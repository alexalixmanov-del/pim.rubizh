# PIM 10.5.2: installation from the hosting terminal

The archive contains the checked application and selected test evidence. It does not contain the owner's catalog backup or private credentials. This branch only supplies deployment artifacts; production hosting has not been updated by creating the branch.

Save a fresh catalog backup in the existing PIM before upgrading. On adm.tools run `install-from-github.sh` using Bash. It downloads the ZIP over HTTPS, checks the pinned SHA-256, and invokes the tested deployment script. The deployment script backs up old application files outside the web directory, preserves unrelated server files, installs public runtime assets, and prints a rollback command.

Default target: `/home/xk589064/rubizh.shop/pim`. For local verification, pass a staging directory as the first argument and set `PIM_BACKUP_ROOT` to a directory outside that target.

Validation: 121 application tests; migration preserves 3113 products and all 8734 SKU; 13 archive/install/rollback checks. Actual hosting installation and shop backend integrations still need validation on the hosting server.
