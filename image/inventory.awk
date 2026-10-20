# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
BEGIN { FS=":"; OFS="\t"; print "package", "version", "license", "origin", "commit", "architecture" }
/^P:/ { package=$2 }
/^V:/ { version=$2 }
/^L:/ { license=substr($0,3) }
/^o:/ { origin=$2 }
/^c:/ { commit=$2 }
/^A:/ { architecture=$2 }
/^$/ { emit() }
END { if(package!="") emit() }
function emit() {
  if(package!="") print package,version,license,origin,commit,architecture
  package=version=license=origin=commit=architecture=""
}
