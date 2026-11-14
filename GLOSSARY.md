# Homora Glossary

- **Service** (card): a shortcut configured on the dashboard, with name, URL, group, and
  display properties. Every card has a monitor, which holds what is checked.
- **Monitor**: what Homora checks (address, check type, interval) and keeps history for. A
  card presents a monitor; a monitor can also exist without a card (see Probe).
- **Probe**: a monitor without a dashboard card, such as the internet connection, a DNS name or
  a TCP port. Managed under Manage > Probes.
- **Integration**: an adapter type that queries an external system, such as
  Jellyfin, Home Assistant, or Proxmox.
- **Connection**: configuration for an integration instance, including address,
  options, and, when required, protected credentials. An integration can have
  multiple connections.
- **Widget**: a record naming a connection to display it on the dashboard. In
  its current state, its query uses data from the associated connection.
- **Proposal**: a service configuration change created by an agent and
  awaiting human review before being applied.
