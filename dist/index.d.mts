import MagicString from "magic-string";
import { Plugin } from "vite";

//#region src/i18n/transform.d.ts
interface I18nOptions {
  enabled?: boolean;
  localeDir?: string;
}
//#endregion
//#region src/types/manifest.d.ts
/**
 * WebExtension manifest.json — Complete TypeScript Type Definitions
 *
 * Covers Manifest V2 and V3, with browser-specific extensions for
 * Chrome, Firefox (gecko), Edge, Opera, and Safari.
 *
 * Specification references:
 *   - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json
 *   - https://developer.chrome.com/docs/extensions/reference/manifest
 *   - https://developer.apple.com/documentation/safariservices/safari_web_extensions
 */
/** ISO 639-1 language code, e.g. "en", "ja", "zh_CN" */
type Locale = string;
/** Semver-like version string, e.g. "1.0.0" or "1.2.3.4" */
type VersionString = string;
/** Relative path inside the extension package */
type RelativePath = string;
/** Absolute URL or relative path */
type UrlOrPath = string;
/** A glob pattern, e.g. "*://*.example.com/*" */
type MatchPattern = string;
/** Icon set: keys are pixel sizes (as strings), values are relative image paths */
type IconSet = {
  [size: string]: RelativePath;
};
/**
 * Run-at timing for content scripts.
 * "document_start"  – injected before the DOM is built.
 * "document_end"    – after the DOM but before sub-resources finish.
 * "document_idle"   – default; after document_end and window.onload.
 */
type RunAt = "document_start" | "document_end" | "document_idle";
/** World in which a content script executes (MV3 Chrome / Firefox 102+) */
type ContentScriptWorld = "ISOLATED" | "MAIN";
interface ContentScript {
  /** URL patterns that trigger the script */
  matches: MatchPattern[];
  /** URL patterns excluded from matching */
  exclude_matches?: MatchPattern[];
  /** CSS files injected into matching pages */
  css?: RelativePath[];
  /** JS files injected into matching pages */
  js?: RelativePath[];
  /**
   * Whether the script runs in all frames or only the top frame.
   * Default: false
   */
  all_frames?: boolean;
  /**
   * Also inject into about:blank and about:srcdoc frames whose
   * parent matches one of the patterns.
   * Default: false
   */
  match_about_blank?: boolean;
  /** match_about_blank alias used in Firefox */
  match_origin_as_fallback?: boolean;
  /** Glob patterns added to `matches` */
  include_globs?: string[];
  /** Glob patterns added to `exclude_matches` */
  exclude_globs?: string[];
  /** When in the document lifecycle to inject */
  run_at?: RunAt;
  /** Execution world (MV3) */
  world?: ContentScriptWorld;
}
/** MV2 background page/scripts */
interface BackgroundMV2 {
  /** HTML page used as the background page */
  page?: RelativePath;
  /** Scripts loaded into an auto-generated background page */
  scripts?: RelativePath[];
  /** Whether to use a persistent background page. Default: true */
  persistent?: boolean;
  /** Firefox: set to "module" to use ES modules in background scripts */
  type?: "classic" | "module";
}
/** MV3 service worker */
interface BackgroundMV3 {
  /** Path to the service-worker script */
  service_worker: RelativePath;
  /** Set to "module" to use ES modules */
  type?: "classic" | "module";
}
type Background = BackgroundMV2 | BackgroundMV3;
interface ActionBase {
  /** Tooltip text shown on hover */
  default_title?: string;
  /** Icon(s) for the toolbar button */
  default_icon?: RelativePath | IconSet;
  /** HTML file shown in the popup */
  default_popup?: RelativePath;
}
/** MV2 `browser_action` */
interface BrowserAction extends ActionBase {
  /**
   * Whether the badge is shown in the toolbar by default.
   * Firefox-only.
   */
  browser_style?: boolean;
  /** Chrome: whether to show in the toolbar by default */
  default_area?: "navbar" | "menupanel" | "tabstrip" | "personaltoolbar";
  /** Theme-specific icons (Firefox) */
  theme_icons?: ThemeIcon[];
}
/** MV2 `page_action` */
interface PageAction extends ActionBase {
  /** Show the page action by default on these URL patterns */
  show_matches?: MatchPattern[];
  /** Hide the page action on these URL patterns */
  hide_matches?: MatchPattern[];
  /** Whether to pin to toolbar by default */
  pinned?: boolean;
  /** Firefox only */
  browser_style?: boolean;
}
/** MV3 unified `action` */
interface Action extends ActionBase {
  browser_style?: boolean;
  theme_icons?: ThemeIcon[];
}
type CommandKey = "Ctrl+<key>" | "Alt+<key>" | "MacCtrl+<key>" | "Command+<key>" | "Ctrl+Shift+<key>" | "Alt+Shift+<key>" | "_execute_browser_action" | "_execute_page_action" | "_execute_action" | "_execute_sidebar_action" | string;
interface Command {
  /** Human-readable description */
  description?: string;
  /** Suggested keyboard shortcut (user can override in browser settings) */
  suggested_key?: {
    default?: CommandKey;
    mac?: CommandKey;
    linux?: CommandKey;
    windows?: CommandKey;
    chromeos?: CommandKey;
    android?: CommandKey;
    ios?: CommandKey;
  };
}
interface OptionsUi {
  /** Path to the options page */
  page: RelativePath;
  /**
   * Open options page in the browser tab rather than an embedded panel.
   * Firefox: default false; Chrome: equivalent to chrome_style.
   */
  open_in_tab?: boolean;
  /** Firefox: apply browser stylesheet to the options page */
  browser_style?: boolean;
  /** Chrome: apply Chrome stylesheet to the options page */
  chrome_style?: boolean;
}
/** MV2 format — plain list of paths/globs */
type WebAccessibleResourcesMV2 = string[];
/** MV3 format — per-origin access control */
interface WebAccessibleResourceMV3 {
  resources: string[];
  matches?: MatchPattern[];
  extension_ids?: string[];
  /** Chrome 108+ – if true, use a stable resource URL */
  use_dynamic_url?: boolean;
}
type WebAccessibleResourcesMV3 = WebAccessibleResourceMV3[];
type WebAccessibleResources = WebAccessibleResourcesMV2 | WebAccessibleResourcesMV3;
type PermissionName = "storage" | "unlimitedStorage" | "alarms" | "history" | "browsingData" | "bookmarks" | "downloads" | "downloads.open" | "downloads.shelf" | "tabs" | "tabGroups" | "activeTab" | "scripting" | "contentSettings" | "contextMenus" | "menus" | "menus.overrideContext" | "cookies" | "debugger" | "declarativeContent" | "declarativeNetRequest" | "declarativeNetRequestWithHostAccess" | "declarativeNetRequestFeedback" | "desktopCapture" | "dns" | "documentScan" | "fontSettings" | "geolocation" | "identity" | "identity.email" | "idle" | "management" | "nativeMessaging" | "notifications" | "pageCapture" | "power" | "printerProvider" | "printing" | "printingMetrics" | "privacy" | "proxy" | "readingList" | "search" | "sessions" | "sidePanel" | "system.cpu" | "system.display" | "system.memory" | "system.storage" | "topSites" | "tts" | "ttsEngine" | "webNavigation" | "webRequest" | "webRequestBlocking" | "webRequestAuthProvider" | "windows" | "clipboardRead" | "clipboardWrite" | "background" | "unsafeExec" | "find" | "pkcs11" | "networkStatus" | "telemetry" | "devtools" | "geckoProfiler" | "captivePortal" | "theme" | "browserSettings" | "userScripts" | MatchPattern | string;
interface DeclarativeNetRequestRuleset {
  /** Unique ID for the ruleset */
  id: string;
  /** Whether the ruleset is enabled on installation */
  enabled: boolean;
  /** Path to the JSON file containing the rules */
  path: RelativePath;
}
interface DeclarativeNetRequest {
  rule_resources: DeclarativeNetRequestRuleset[];
}
interface ChromeUrlOverrides {
  /** Replace the new-tab page */
  newtab?: RelativePath;
  /** Replace the bookmarks manager page */
  bookmarks?: RelativePath;
  /** Replace the browsing history page */
  history?: RelativePath;
}
interface SearchProviderOverride {
  name: string;
  keyword: string;
  search_url: string;
  favicon_url?: string;
  suggest_url?: string;
  instant_url?: string;
  image_url?: string;
  search_url_post_params?: string;
  suggest_url_post_params?: string;
  instant_url_post_params?: string;
  image_url_post_params?: string;
  alternate_urls?: string[];
  encoding?: string;
  is_default?: boolean;
}
interface ChromeSettingsOverrides {
  homepage?: string;
  search_provider?: SearchProviderOverride;
  startup_pages?: string[];
}
interface Omnibox {
  /** Keyword that triggers the extension's omnibox suggestions */
  keyword: string;
}
/** Path to the DevTools extension page */
type DevtoolsPage = RelativePath;
interface SidePanel {
  default_path?: RelativePath;
}
interface SidebarAction {
  default_title?: string;
  default_icon?: RelativePath | IconSet;
  default_panel: RelativePath;
  browser_style?: boolean;
  open_at_install?: boolean;
}
interface UserScripts {
  api_script?: RelativePath;
}
interface GeckoId {
  id?: string;
  /** Earliest Firefox version that supports this extension */
  strict_min_version?: string;
  /** Latest Firefox version that supports this extension */
  strict_max_version?: string;
  /** Update URL for the extension */
  update_url?: string;
}
interface GeckoAndroid {
  strict_min_version?: string;
  strict_max_version?: string;
}
interface BrowserSpecificSettingsGecko {
  gecko?: GeckoId;
  gecko_android?: GeckoAndroid;
}
interface BrowserSpecificSettingsSafari {
  safari?: {
    strict_min_version?: string;
    strict_max_version?: string;
  };
}
type BrowserSpecificSettings = BrowserSpecificSettingsGecko & BrowserSpecificSettingsSafari;
interface ChromeSpecificSettings {
  /** Extension ID to use in Chrome (for development) */
  extension_id?: string;
}
interface ExternallyConnectable {
  /** URL match patterns for web pages that can connect */
  matches?: MatchPattern[];
  /** Extension IDs that can connect */
  ids?: string[];
  /** Whether TLS channel ID is accepted */
  accepts_tls_channel_id?: boolean;
}
interface FileBrowserHandler {
  id: string;
  default_title: string;
  file_filters: string[];
  file_access?: ("read" | "write")[];
}
interface InputComponent {
  name: string;
  id: string;
  language?: string;
  layouts?: string[];
  input_view?: RelativePath;
  options_page?: RelativePath;
  type?: string[];
}
interface ProtocolHandler {
  name: string;
  protocol: string;
  uriTemplate: string;
}
interface ThemeColor {
  /** Hex, RGB, RGBA string, or named CSS color */
  [key: string]: string | undefined;
  bookmark_text?: string;
  button_background_active?: string;
  button_background_hover?: string;
  frame?: string;
  frame_inactive?: string;
  icons?: string;
  icons_attention?: string;
  ntp_background?: string;
  ntp_text?: string;
  popup?: string;
  popup_border?: string;
  popup_highlight?: string;
  popup_highlight_text?: string;
  popup_text?: string;
  sidebar?: string;
  sidebar_border?: string;
  sidebar_highlight?: string;
  sidebar_highlight_text?: string;
  sidebar_text?: string;
  tab_background_separator?: string;
  tab_background_text?: string;
  tab_line?: string;
  tab_loading?: string;
  tab_selected?: string;
  tab_text?: string;
  toolbar?: string;
  toolbar_bottom_separator?: string;
  toolbar_field?: string;
  toolbar_field_border?: string;
  toolbar_field_border_focus?: string;
  toolbar_field_focus?: string;
  toolbar_field_highlight?: string;
  toolbar_field_highlight_text?: string;
  toolbar_field_separator?: string;
  toolbar_field_text?: string;
  toolbar_field_text_focus?: string;
  toolbar_text?: string;
  toolbar_top_separator?: string;
  toolbar_vertical_separator?: string;
}
interface ThemeImages {
  [key: string]: RelativePath | RelativePath[] | undefined;
  additional_backgrounds?: RelativePath[];
  headerURL?: RelativePath;
  theme_frame?: RelativePath;
}
interface ThemeProperties {
  [key: string]: string | string[] | number | undefined;
  additional_backgrounds_alignment?: string[];
  additional_backgrounds_tiling?: string[];
  color_scheme?: "auto" | "dark" | "light" | "system";
  content_color_scheme?: "auto" | "dark" | "light" | "system";
}
interface Theme {
  images?: ThemeImages;
  colors?: ThemeColor;
  properties?: ThemeProperties;
}
interface ThemeIcon {
  light?: RelativePath;
  dark?: RelativePath;
  size: number;
}
interface StorageManagedSchemaProperty {
  type: "boolean" | "integer" | "number" | "string" | "array" | "object";
  title?: string;
  description?: string;
  default?: unknown;
  items?: StorageManagedSchemaProperty;
  properties?: Record<string, StorageManagedSchemaProperty>;
  required?: string[];
}
interface StorageManaged {
  schema?: {
    type: "object";
    properties: Record<string, StorageManagedSchemaProperty>;
  };
}
type IncognitoMode = "spanning" | "split" | "not_allowed";
/** MV2: a single CSP string */
type ContentSecurityPolicyMV2 = string;
/** MV3: separate CSPs for extension pages and sandboxed pages */
interface ContentSecurityPolicyMV3 {
  extension_pages?: string;
  sandbox?: string;
  /** Firefox 72+ isolated worlds */
  content_scripts?: string;
}
type ContentSecurityPolicy = ContentSecurityPolicyMV2 | ContentSecurityPolicyMV3;
interface Sandbox {
  pages: RelativePath[];
  content_security_policy?: string;
}
type OfflineEnabled = boolean;
interface WebExtensionManifest {
  /**
   * Manifest format version.
   * Use 2 for MV2, 3 for MV3.
   */
  manifest_version: 2 | 3;
  /** Human-readable display name. May be a __MSG_key__ placeholder. */
  name: string;
  /**
   * Version string in the format A.B.C.D where each component is
   * 0–65535. All components after the first are optional.
   */
  version: VersionString;
  /** Short description shown in browser extension listings */
  description?: string;
  /**
   * Human-readable version string (not parsed by the browser).
   * Use for marketing versions, e.g. "2024 Spring Edition".
   */
  version_name?: string;
  /** Extension icons at various resolutions */
  icons?: IconSet;
  /** Locale used as a fallback when the user's locale is not available */
  default_locale?: Locale;
  /** Developer or organisation info (Firefox) */
  author?: string | {
    name?: string;
    url?: string;
  };
  /** URL for extension homepage */
  homepage_url?: UrlOrPath;
  /** URL shown to the user before installation */
  short_name?: string;
  /**
   * MV2 toolbar button.
   * Mutually exclusive with `page_action` in Chrome.
   */
  browser_action?: BrowserAction;
  /**
   * MV2 URL-bar button (per-page).
   * Mutually exclusive with `browser_action` in Chrome.
   */
  page_action?: PageAction;
  /** MV3 unified toolbar/URL-bar button */
  action?: Action;
  /** Side panel (Chrome 114+) */
  side_panel?: SidePanel;
  /** Firefox sidebar */
  sidebar_action?: SidebarAction;
  /** Options / settings page */
  options_page?: RelativePath;
  /** Embedded or tab-based options page */
  options_ui?: OptionsUi;
  /** Chrome DevTools panel */
  devtools_page?: DevtoolsPage;
  /** Override browser built-in pages */
  chrome_url_overrides?: ChromeUrlOverrides;
  /** Background page or service worker */
  background?: Background;
  /** Content scripts injected into web pages */
  content_scripts?: ContentScript[];
  /** Sandboxed extension pages */
  sandbox?: Sandbox;
  /** Permissions requested at install time */
  permissions?: PermissionName[];
  /**
   * Optional permissions requested at run time via `permissions.request()`.
   * MV2: host patterns only. MV3: API permissions + host patterns.
   */
  optional_permissions?: PermissionName[];
  /**
   * MV3 host permissions (separate from API permissions).
   * In MV2 these go in `permissions`.
   */
  host_permissions?: MatchPattern[];
  /**
   * MV3 optional host permissions (requested at runtime).
   */
  optional_host_permissions?: MatchPattern[];
  /**
   * Files inside the extension accessible by web pages.
   * MV2: array of path/glob strings.
   * MV3: array of objects with `resources`, `matches`, and `extension_ids`.
   */
  web_accessible_resources?: WebAccessibleResources;
  /**
   * Content Security Policy.
   * MV2: single CSP string.
   * MV3: object with `extension_pages` and optionally `sandbox`.
   */
  content_security_policy?: ContentSecurityPolicy;
  /** Map of command names to `Command` descriptors */
  commands?: Record<string, Command>;
  omnibox?: Omnibox;
  chrome_settings_overrides?: ChromeSettingsOverrides;
  declarative_net_request?: DeclarativeNetRequest;
  externally_connectable?: ExternallyConnectable;
  /** Firefox protocol handlers */
  protocol_handlers?: ProtocolHandler[];
  theme?: Theme;
  dark_theme?: Theme;
  storage?: StorageManaged;
  user_scripts?: UserScripts;
  incognito?: IncognitoMode;
  input_components?: InputComponent[];
  file_browser_handlers?: FileBrowserHandler[];
  offline_enabled?: OfflineEnabled;
  minimum_chrome_version?: VersionString;
  nacl_modules?: Array<{
    path: RelativePath;
    mime_type: string;
  }>;
  update_url?: string;
  /** Firefox / Safari specific settings */
  browser_specific_settings?: BrowserSpecificSettings;
  /** Chrome-specific settings (rarely used in manifest directly) */
  chrome_specific_settings?: ChromeSpecificSettings;
  [key: string]: unknown;
}
//#endregion
//#region src/index.d.ts
type BrowserTarget = 'chrome' | 'firefox';
type ManifestFactory = (browser: BrowserTarget) => WebExtensionManifest;
interface WebExtOptions {
  /**
   * Default browser target used when Vite mode is not `chrome` or `firefox`.
   */
  defaultBrowser?: BrowserTarget;
  /**
   * Target browser for this build.
   * Backward-compatible alias for `defaultBrowser`.
   */
  browser?: BrowserTarget;
  /**
   * How to handle unavailable APIs at build time.
   * - 'error'  : throw a build error (default)
   * - 'warn'   : emit a warning and continue
   * - 'ignore' : silently skip
   */
  unavailableApi?: 'error' | 'warn' | 'ignore';
  /**
   * Statically rewrite extension API namespaces to the target browser namespace.
   * Default: true
   */
  staticTransform?: boolean;
  /**
   * Backward-compatible alias for `staticTransform`.
   */
  injectGlobals?: boolean;
  /**
   * Manifest definition written to `manifest.json` during build.
   * You can pass a plain object or a factory function per browser target.
   */
  manifest?: WebExtensionManifest | ManifestFactory;
  /**
   * Generate source/dist zip artifacts under dist.
   * Default: true
   */
  zipArtifacts?: boolean;
  /**
   * Enable i18n helpers:
   * - derive locale message id types from `src/locale/[localeName].ts` files exporting `defineLocale({...})`
   * - statically rewrite `t(id)` to `browser.i18n.getMessage(id)`
   *
   * Default: disabled
   */
  i18n?: boolean | I18nOptions;
}
declare function webext(options: WebExtOptions): Plugin;
//#endregion
export { BrowserTarget, ManifestFactory, WebExtOptions, webext };
//# sourceMappingURL=index.d.mts.map