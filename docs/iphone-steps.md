# iPhone steps

The current web app does not directly read Apple Health. The implemented bridge accepts daily absolute step totals sent by an iPhone Shortcut after the owner explicitly creates a limited connection in Settings. The phone owns Health access permissions and the automation schedule. No Huawei/Apple password or general account session belongs in the Shortcut.

For Huawei watches on iPhone, first enable Huawei Health sharing in Apple Health and check that the Steps data-source list includes Huawei. Where unavailable, the iPhone's own step source can be used. Availability and labels vary by app/region/version. Select one source in Find Health Samples and sum that source's step quantities for the chosen day; do not sum overlapping phone/watch sources. Compare the first total with that selected source before enabling automatic sends.

In Become Better Settings, consent to sending date/steps and prepare a connection. Copy the endpoint, public `apikey` header and one-time private `connection_key` into a new Shortcut. Use Get Contents of URL with POST, JSON content type, and these body fields:

| Field | Value |
| --- | --- |
| `connection_key` | Owner-created connection key, never a service-role key |
| `day` | The phone's chosen local date formatted `yyyy-MM-dd` |
| `step_count` | Absolute sum as a JSON number |
| `source` | `Apple Zdraví`, `Huawei Zdraví`, or `iPhone` |

Before summing, add an If action: if the number of found samples is zero, stop the Shortcut. Missing data or denied permission must skip the request, not write a fabricated zero. Run once with the phone unlocked, grant its Health/network permissions, and confirm the received total shown in Settings.

For the first automation, use App → Huawei Health → Is Closed → Run Immediately. After syncing the watch and leaving Huawei Health, it sends the current day's total while the phone is unlocked. A time automation can also be added, but Apple documents that Health data becomes inaccessible ten minutes after the device locks; an unattended night schedule is not a reliable default. The total reflects the moment of execution. Connectivity, source filtering, app synchronization and iOS automation behavior still need verification on the owner's device; an API/unit test is not proof that the phone automation works.

The endpoint is `/rest/v1/rpc/submit_health_steps` on the independent Supabase project. It authenticates only a hashed connection key and can update that owner's steps/source/time fields on the canonical daily record. It cannot read data, change calories/notes/workouts or revive a deleted record. The date window is the last 31 days plus one timezone day; totals must be 0–200000. Up to three unexpired connections are allowed per owner. The raw key appears only on creation, is not stored by the app, and expires after a year. Revocation stops later writes immediately. Never publish a connection key in GitHub, an iCloud-shared Shortcut, chat or a screenshot.

Direct Huawei Health Kit cloud access is a separate future integration requiring a developer app, requested scopes, user authorization and protected server credentials. Do not show it as connected without those requirements and a real data round trip.

Sources: [Huawei step sharing](https://consumer.huawei.com/cn/support/content/zh-cn15923276/), [Apple Shortcut API requests](https://support.apple.com/en-eg/guide/shortcuts/apd58d46713f/ios), [Apple app automation triggers](https://support.apple.com/en-ph/guide/shortcuts/apde31e9638b/ios), [Apple Health data protection](https://support.apple.com/guide/security-pdf/protecting-access-to-users-health-data-sec88be9900f/web), [Huawei Health Kit](https://developer.huawei.com/consumer/en/hms/huaweihealth/).
