#!/bin/sh
case "$*" in
  *'-j addr show dev eth9'*) echo '[{"addr_info":[{"family":"inet","local":"192.168.0.2","prefixlen":24}]}]' ;;
  *) exit 0 ;;
esac
