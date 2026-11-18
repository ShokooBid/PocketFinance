import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Screen } from "../../ui";
import { ReportsScreen } from "../../reports-screen";
import { createReportSource } from "../../report-data";
import {
  createApiDashboardSource,
  createDemoDashboardSource
} from "../../dashboard-data";
import { useSession } from "../../session";
import { useTransactions, useFinanceChanges } from "../../transaction-context";
import { useCategories } from "../../category-context";
import { PreferencesReady, usePreferences } from "../../preferences";

export default function OverviewRoute() {
  return (
    <PreferencesReady>
      <OverviewScreen />
    </PreferencesReady>
  );
}
function OverviewScreen() {
  const { session, controller } = useSession();
  const transactions = useTransactions();
  const changes = useFinanceChanges();
  const categories = useCategories();
  const { defaultCurrency } = usePreferences();
  const [active, setActive] = useState(false);
  const [source] = useState(() => {
    if (session.status === "demo")
      return createReportSource(
        createDemoDashboardSource(transactions, categories, changes),
        categories
      );
    if (session.status === "authenticated")
      return createReportSource(
        createApiDashboardSource(
          controller.client(session.generation),
          changes
        ),
        categories
      );
    throw new Error("Overview requires an application session.");
  });
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [])
  );
  return (
    <Screen title="Overview" appearance="overview">
      {/* A visit owns its report state. Ordinary renders/refreshes keep it;
          leaving the route unmounts it so reentry uses the local current month. */}
      {active && (
        <ReportsScreen
          source={source}
          currency={defaultCurrency}
          demo={session.status === "demo"}
        />
      )}
    </Screen>
  );
}
