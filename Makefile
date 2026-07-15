include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-usb-modem
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=HoshimiRIN

LUCI_TITLE:=LuCI USB modem diagnostics and xHCI recovery
LUCI_DEPENDS:=+luci-base +rpcd-mod-file +ip-full +kmod-usb-net +kmod-usb-net-rndis
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
