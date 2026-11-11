# Homora Glossary

- **Service**: a shortcut configured on the dashboard, with name, URL, group, and
  display properties. Does not imply a configured integration or monitoring.
- **Integration**: an adapter type that queries an external system, such as
  Jellyfin, Home Assistant, or Proxmox.
- **Connection**: configuration for an integration instance, including address,
  options, and, when required, protected credentials. An integration can have
  multiple connections.
- **Widget**: a record naming a connection to display it on the dashboard. In
  its current state, its query uses data from the associated connection.
- **Proposal**: a service configuration change created by an agent and
  awaiting human review before being applied.
