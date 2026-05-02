function trackGa4Pageview(analytics) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  const pagePath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.gtag("config", analytics.measurementId, {
    page_path: pagePath,
    page_location: window.location.href,
  });
}

function trackPlausiblePageview() {
  if (typeof window === "undefined" || typeof window.plausible !== "function") {
    return;
  }

  window.plausible("pageview", {
    u: window.location.href,
  });
}

export function registerSiteAnalytics(router) {
  if (typeof window === "undefined" || !router) {
    return;
  }

  const analytics = __LITSX_ANALYTICS__;
  if (!analytics?.provider) {
    return;
  }

  const trackPageview = () => {
    if (analytics.provider === "ga4") {
      trackGa4Pageview(analytics);
      return;
    }

    if (analytics.provider === "plausible") {
      trackPlausiblePageview();
    }
  };

  if (analytics.provider === "ga4") {
    queueMicrotask(trackPageview);
  }

  let isFirstRoute = true;
  const originalHandler = router.onAfterRouteChange ?? router.onAfterRouteChanged;

  router.onAfterRouteChange = async (to) => {
    await originalHandler?.(to);

    if (analytics.provider === "plausible" && isFirstRoute) {
      isFirstRoute = false;
      return;
    }

    isFirstRoute = false;
    trackPageview();
  };
}
