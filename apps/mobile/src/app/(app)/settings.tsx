import { AccountManagement } from "../../account-management";
import { useAccounts, useFinanceChanges } from "../../transaction-context";
import { useCallback, useRef, useState, type ComponentRef } from "react";
import type { ScrollView } from "react-native";
import { useSession } from "../../session";
import { Body, Button, Screen, StateNotice } from "../../ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { usePreferences } from "../../preferences";

export { ErrorBoundary } from "../../error-boundary";

export default function AccountsScreen() {
  const { session } = useSession();
  const {
    selectedCurrency,
    defaultAccountId,
    setDefaultAccount,
    currencyState
  } = usePreferences();
  const accounts = useAccounts();
  const changes = useFinanceChanges();
  const [active, setActive] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const { returnTo } = useLocalSearchParams();
  const returningToDraft = returnTo === "transaction-draft";
  const { reload, status, saving, error } = currencyState;
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [])
  );
  const router = useRouter();
  return (
    <Screen
      title="Accounts"
      scrollRef={scrollRef}
      {...(returningToDraft
        ? {
            backAction: {
              label: "Return to transaction draft",
              onPress: () =>
                router.canGoBack() ? router.back() : router.replace("/")
            }
          }
        : {})}
    >
      {(status === "loading" || saving) && (
        <StateNotice
          kind="loading"
          title="Checking account preferences"
          message="Confirming your currency and default account."
        />
      )}
      {error && (
        <StateNotice
          kind="error"
          title="Account preferences need attention"
          message={error}
          onRetry={() => void reload()}
        />
      )}
      {selectedCurrency !== null ? (
        <AccountManagement
          source={accounts}
          changes={changes}
          onRevealEditForm={() => scrollRef.current?.scrollToEnd()}
          {...(session.status === "authenticated"
            ? {
                onOpenHistory: (accountId: string) =>
                  router.push({
                    pathname: "/transactions",
                    params: { accountId }
                  })
              }
            : {})}
          currency={selectedCurrency}
          defaultAccountId={defaultAccountId}
          onDefault={setDefaultAccount}
          onReloadPreferences={reload}
          active={active}
          preferencesReady={status === "ready" && !saving}
        />
      ) : (
        status === "ready" &&
        !saving && (
          <>
            <Body>
              Choose your permanent currency before adding an account.
            </Body>
            <Button
              label="Continue setup"
              onPress={() => router.replace("/")}
            />
          </>
        )
      )}
    </Screen>
  );
}
