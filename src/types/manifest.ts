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

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

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

/** CSS selector string */
type CssSelector = string;

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

/** Icon set: keys are pixel sizes (as strings), values are relative image paths */
export type IconSet = {
  [size: string]: RelativePath;
};

/**
 * Run-at timing for content scripts.
 * "document_start"  – injected before the DOM is built.
 * "document_end"    – after the DOM but before sub-resources finish.
 * "document_idle"   – default; after document_end and window.onload.
 */
export type RunAt = "document_start" | "document_end" | "document_idle";

/** World in which a content script executes (MV3 Chrome / Firefox 102+) */
export type ContentScriptWorld = "ISOLATED" | "MAIN";

// ---------------------------------------------------------------------------
// Content Scripts
// ---------------------------------------------------------------------------

export interface ContentScript {
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

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

/** MV2 background page/scripts */
export interface BackgroundMV2 {
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
export interface BackgroundMV3 {
  /** Path to the service-worker script */
  service_worker: RelativePath;
  /** Set to "module" to use ES modules */
  type?: "classic" | "module";
}

export type Background = BackgroundMV2 | BackgroundMV3;

// ---------------------------------------------------------------------------
// Browser Action / Page Action / Action
// ---------------------------------------------------------------------------

export interface ActionBase {
  /** Tooltip text shown on hover */
  default_title?: string;
  /** Icon(s) for the toolbar button */
  default_icon?: RelativePath | IconSet;
  /** HTML file shown in the popup */
  default_popup?: RelativePath;
}

/** MV2 `browser_action` */
export interface BrowserAction extends ActionBase {
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
export interface PageAction extends ActionBase {
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
export interface Action extends ActionBase {
  browser_style?: boolean;
  theme_icons?: ThemeIcon[];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type CommandKey =
  | "Ctrl+<key>"
  | "Alt+<key>"
  | "MacCtrl+<key>"
  | "Command+<key>"
  | "Ctrl+Shift+<key>"
  | "Alt+Shift+<key>"
  | "_execute_browser_action"
  | "_execute_page_action"
  | "_execute_action"
  | "_execute_sidebar_action"
  | string;

export interface Command {
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

// ---------------------------------------------------------------------------
// Options UI
// ---------------------------------------------------------------------------

export interface OptionsUi {
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

// ---------------------------------------------------------------------------
// Web Accessible Resources
// ---------------------------------------------------------------------------

/** MV2 format — plain list of paths/globs */
export type WebAccessibleResourcesMV2 = string[];

/** MV3 format — per-origin access control */
export interface WebAccessibleResourceMV3 {
  resources: string[];
  matches?: MatchPattern[];
  extension_ids?: string[];
  /** Chrome 108+ – if true, use a stable resource URL */
  use_dynamic_url?: boolean;
}

export type WebAccessibleResourcesMV3 = WebAccessibleResourceMV3[];

export type WebAccessibleResources =
  | WebAccessibleResourcesMV2
  | WebAccessibleResourcesMV3;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type PermissionName =
  // Storage
  | "storage"
  | "unlimitedStorage"
  // Alarms / scheduling
  | "alarms"
  // Browsing data / history
  | "history"
  | "browsingData"
  // Bookmarks
  | "bookmarks"
  // Downloads
  | "downloads"
  | "downloads.open"
  | "downloads.shelf"
  // Tabs
  | "tabs"
  | "tabGroups"
  // Active tab
  | "activeTab"
  // Scripting (MV3)
  | "scripting"
  // Content settings
  | "contentSettings"
  // Context menus
  | "contextMenus"
  | "menus"
  | "menus.overrideContext"
  // Cookies
  | "cookies"
  // Debugger
  | "debugger"
  // Declarative content
  | "declarativeContent"
  // Declarative net request (MV3)
  | "declarativeNetRequest"
  | "declarativeNetRequestWithHostAccess"
  | "declarativeNetRequestFeedback"
  // Desktop capture
  | "desktopCapture"
  // DNS
  | "dns"
  // Document scan
  | "documentScan"
  // Font settings
  | "fontSettings"
  // Geolocation
  | "geolocation"
  // Identity
  | "identity"
  | "identity.email"
  // Idle
  | "idle"
  // Management
  | "management"
  // Native messaging
  | "nativeMessaging"
  // Notifications
  | "notifications"
  // Page capture
  | "pageCapture"
  // Power
  | "power"
  // Print
  | "printerProvider"
  | "printing"
  | "printingMetrics"
  // Privacy
  | "privacy"
  // Proxy
  | "proxy"
  // Reading list
  | "readingList"
  // Search
  | "search"
  // Sessions
  | "sessions"
  // Side panel (Chrome 114+)
  | "sidePanel"
  // System info
  | "system.cpu"
  | "system.display"
  | "system.memory"
  | "system.storage"
  // Top sites
  | "topSites"
  // TTS / speech
  | "tts"
  | "ttsEngine"
  // Web navigation
  | "webNavigation"
  // Web request
  | "webRequest"
  | "webRequestBlocking"
  | "webRequestAuthProvider"
  // Window management
  | "windows"
  // Clipboard
  | "clipboardRead"
  | "clipboardWrite"
  // Background sync
  | "background"
  // Unsafe scripting (Firefox)
  | "unsafeExec"
  // Firefox-specific
  | "find"
  | "pkcs11"
  | "networkStatus"
  | "telemetry"
  | "devtools"
  | "geckoProfiler"
  | "captivePortal"
  | "theme"
  | "browserSettings"
  | "userScripts"
  // Allow catch-all host patterns + custom strings
  | MatchPattern
  | string;

// ---------------------------------------------------------------------------
// Declarative Net Request (MV3)
// ---------------------------------------------------------------------------

export interface DeclarativeNetRequestRuleset {
  /** Unique ID for the ruleset */
  id: string;
  /** Whether the ruleset is enabled on installation */
  enabled: boolean;
  /** Path to the JSON file containing the rules */
  path: RelativePath;
}

export interface DeclarativeNetRequest {
  rule_resources: DeclarativeNetRequestRuleset[];
}

// ---------------------------------------------------------------------------
// Chrome URL Overrides
// ---------------------------------------------------------------------------

export interface ChromeUrlOverrides {
  /** Replace the new-tab page */
  newtab?: RelativePath;
  /** Replace the bookmarks manager page */
  bookmarks?: RelativePath;
  /** Replace the browsing history page */
  history?: RelativePath;
}

// ---------------------------------------------------------------------------
// Chrome Settings Overrides
// ---------------------------------------------------------------------------

export interface SearchProviderOverride {
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

export interface ChromeSettingsOverrides {
  homepage?: string;
  search_provider?: SearchProviderOverride;
  startup_pages?: string[];
}

// ---------------------------------------------------------------------------
// Omnibox
// ---------------------------------------------------------------------------

export interface Omnibox {
  /** Keyword that triggers the extension's omnibox suggestions */
  keyword: string;
}

// ---------------------------------------------------------------------------
// DevTools Page
// ---------------------------------------------------------------------------

/** Path to the DevTools extension page */
export type DevtoolsPage = RelativePath;

// ---------------------------------------------------------------------------
// Side Panel (Chrome 114+)
// ---------------------------------------------------------------------------

export interface SidePanel {
  default_path?: RelativePath;
}

// ---------------------------------------------------------------------------
// Sidebar Action (Firefox)
// ---------------------------------------------------------------------------

export interface SidebarAction {
  default_title?: string;
  default_icon?: RelativePath | IconSet;
  default_panel: RelativePath;
  browser_style?: boolean;
  open_at_install?: boolean;
}

// ---------------------------------------------------------------------------
// User Scripts (Firefox MV2)
// ---------------------------------------------------------------------------

export interface UserScripts {
  api_script?: RelativePath;
}

// ---------------------------------------------------------------------------
// Firefox Gecko-specific Keys
// ---------------------------------------------------------------------------

export interface GeckoId {
  id?: string;
  /** Earliest Firefox version that supports this extension */
  strict_min_version?: string;
  /** Latest Firefox version that supports this extension */
  strict_max_version?: string;
  /** Update URL for the extension */
  update_url?: string;
}

export interface GeckoAndroid {
  strict_min_version?: string;
  strict_max_version?: string;
}

export interface BrowserSpecificSettingsGecko {
  gecko?: GeckoId;
  gecko_android?: GeckoAndroid;
}

export interface BrowserSpecificSettingsSafari {
  safari?: {
    strict_min_version?: string;
    strict_max_version?: string;
  };
}

export type BrowserSpecificSettings =
  & BrowserSpecificSettingsGecko
  & BrowserSpecificSettingsSafari;

// ---------------------------------------------------------------------------
// Chrome-specific Settings
// ---------------------------------------------------------------------------

export interface ChromeSpecificSettings {
  /** Extension ID to use in Chrome (for development) */
  extension_id?: string;
}

// ---------------------------------------------------------------------------
// Externally Connectable (Chrome)
// ---------------------------------------------------------------------------

export interface ExternallyConnectable {
  /** URL match patterns for web pages that can connect */
  matches?: MatchPattern[];
  /** Extension IDs that can connect */
  ids?: string[];
  /** Whether TLS channel ID is accepted */
  accepts_tls_channel_id?: boolean;
}

// ---------------------------------------------------------------------------
// File Browser Handlers (ChromeOS)
// ---------------------------------------------------------------------------

export interface FileBrowserHandler {
  id: string;
  default_title: string;
  file_filters: string[];
  file_access?: ("read" | "write")[];
}

// ---------------------------------------------------------------------------
// Input Components
// ---------------------------------------------------------------------------

export interface InputComponent {
  name: string;
  id: string;
  language?: string;
  layouts?: string[];
  input_view?: RelativePath;
  options_page?: RelativePath;
  type?: string[];
}

// ---------------------------------------------------------------------------
// Protocol Handlers (Firefox)
// ---------------------------------------------------------------------------

export interface ProtocolHandler {
  name: string;
  protocol: string;
  uriTemplate: string;
}

// ---------------------------------------------------------------------------
// Theme (Firefox)
// ---------------------------------------------------------------------------

export interface ThemeColor {
  /** Hex, RGB, RGBA string, or named CSS color */
  [key: string]: string | undefined;
  // Common keys:
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

export interface ThemeImages {
  [key: string]: RelativePath | RelativePath[] | undefined;
  additional_backgrounds?: RelativePath[];
  headerURL?: RelativePath;
  theme_frame?: RelativePath;
}

export interface ThemeProperties {
  [key: string]: string | string[] | number | undefined;
  additional_backgrounds_alignment?: string[];
  additional_backgrounds_tiling?: string[];
  color_scheme?: "auto" | "dark" | "light" | "system";
  content_color_scheme?: "auto" | "dark" | "light" | "system";
}

export interface Theme {
  images?: ThemeImages;
  colors?: ThemeColor;
  properties?: ThemeProperties;
}

export interface ThemeIcon {
  light?: RelativePath;
  dark?: RelativePath;
  size: number;
}

// ---------------------------------------------------------------------------
// Storage — managed schema
// ---------------------------------------------------------------------------

export interface StorageManagedSchemaProperty {
  type: "boolean" | "integer" | "number" | "string" | "array" | "object";
  title?: string;
  description?: string;
  default?: unknown;
  items?: StorageManagedSchemaProperty;
  properties?: Record<string, StorageManagedSchemaProperty>;
  required?: string[];
}

export interface StorageManaged {
  schema?: {
    type: "object";
    properties: Record<string, StorageManagedSchemaProperty>;
  };
}

// ---------------------------------------------------------------------------
// Incognito mode
// ---------------------------------------------------------------------------

export type IncognitoMode =
  | "spanning"   // share single instance between regular and incognito tabs
  | "split"      // separate instance for incognito
  | "not_allowed"; // cannot run in incognito

// ---------------------------------------------------------------------------
// Content Security Policy
// ---------------------------------------------------------------------------

/** MV2: a single CSP string */
export type ContentSecurityPolicyMV2 = string;

/** MV3: separate CSPs for extension pages and sandboxed pages */
export interface ContentSecurityPolicyMV3 {
  extension_pages?: string;
  sandbox?: string;
  /** Firefox 72+ isolated worlds */
  content_scripts?: string;
}

export type ContentSecurityPolicy =
  | ContentSecurityPolicyMV2
  | ContentSecurityPolicyMV3;

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export interface Sandbox {
  pages: RelativePath[];
  content_security_policy?: string;
}

// ---------------------------------------------------------------------------
// Offline Enabled
// ---------------------------------------------------------------------------

export type OfflineEnabled = boolean;

// ---------------------------------------------------------------------------
// Short Name / Name
// ---------------------------------------------------------------------------

/** Localised message key or raw string */
type MessageKey = string;

// ---------------------------------------------------------------------------
// Main Manifest type (unified MV2 + MV3)
// ---------------------------------------------------------------------------

export interface WebExtensionManifest {
  // -------------------------------------------------------------------------
  // Required fields
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Recommended fields
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Author / Metadata
  // -------------------------------------------------------------------------

  /** Developer or organisation info (Firefox) */
  author?: string | { name?: string; url?: string };
  /** URL for extension homepage */
  homepage_url?: UrlOrPath;
  /** URL shown to the user before installation */
  short_name?: string;

  // -------------------------------------------------------------------------
  // UI Entry Points
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Scripts & Pages
  // -------------------------------------------------------------------------

  /** Background page or service worker */
  background?: Background;

  /** Content scripts injected into web pages */
  content_scripts?: ContentScript[];

  /** Sandboxed extension pages */
  sandbox?: Sandbox;

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Resources & CSP
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Keyboard Shortcuts
  // -------------------------------------------------------------------------

  /** Map of command names to `Command` descriptors */
  commands?: Record<string, Command>;

  // -------------------------------------------------------------------------
  // Omnibox
  // -------------------------------------------------------------------------

  omnibox?: Omnibox;

  // -------------------------------------------------------------------------
  // Search Engine
  // -------------------------------------------------------------------------

  chrome_settings_overrides?: ChromeSettingsOverrides;

  // -------------------------------------------------------------------------
  // Declarative Net Request (MV3)
  // -------------------------------------------------------------------------

  declarative_net_request?: DeclarativeNetRequest;

  // -------------------------------------------------------------------------
  // Connectivity
  // -------------------------------------------------------------------------

  externally_connectable?: ExternallyConnectable;

  /** Firefox protocol handlers */
  protocol_handlers?: ProtocolHandler[];

  // -------------------------------------------------------------------------
  // Theme (Firefox)
  // -------------------------------------------------------------------------

  theme?: Theme;
  dark_theme?: Theme;

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  storage?: StorageManaged;

  // -------------------------------------------------------------------------
  // User Scripts (Firefox, MV2)
  // -------------------------------------------------------------------------

  user_scripts?: UserScripts;

  // -------------------------------------------------------------------------
  // Incognito / Private Browsing
  // -------------------------------------------------------------------------

  incognito?: IncognitoMode;

  // -------------------------------------------------------------------------
  // Input Method Editor (ChromeOS)
  // -------------------------------------------------------------------------

  input_components?: InputComponent[];

  // -------------------------------------------------------------------------
  // File Browser Handlers (ChromeOS)
  // -------------------------------------------------------------------------

  file_browser_handlers?: FileBrowserHandler[];

  // -------------------------------------------------------------------------
  // Offline
  // -------------------------------------------------------------------------

  offline_enabled?: OfflineEnabled;

  // -------------------------------------------------------------------------
  // Minimum Chrome Version
  // -------------------------------------------------------------------------

  minimum_chrome_version?: VersionString;

  // -------------------------------------------------------------------------
  // NaCl Modules (deprecated)
  // -------------------------------------------------------------------------

  nacl_modules?: Array<{
    path: RelativePath;
    mime_type: string;
  }>;

  // -------------------------------------------------------------------------
  // Update URL (self-hosted extensions)
  // -------------------------------------------------------------------------

  update_url?: string;

  // -------------------------------------------------------------------------
  // Browser-specific settings
  // -------------------------------------------------------------------------

  /** Firefox / Safari specific settings */
  browser_specific_settings?: BrowserSpecificSettings;

  /** Chrome-specific settings (rarely used in manifest directly) */
  chrome_specific_settings?: ChromeSpecificSettings;

  // -------------------------------------------------------------------------
  // Catch-all for non-standard / future keys
  // -------------------------------------------------------------------------

  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

/** Manifest V2 specialisation */
export type ManifestV2 = WebExtensionManifest & {
  manifest_version: 2;
  background?: BackgroundMV2;
  content_security_policy?: ContentSecurityPolicyMV2;
  web_accessible_resources?: WebAccessibleResourcesMV2;
};

/** Manifest V3 specialisation */
export type ManifestV3 = WebExtensionManifest & {
  manifest_version: 3;
  background?: BackgroundMV3;
  content_security_policy?: ContentSecurityPolicyMV3;
  web_accessible_resources?: WebAccessibleResourcesMV3;
  host_permissions?: MatchPattern[];
  optional_host_permissions?: MatchPattern[];
  declarative_net_request?: DeclarativeNetRequest;
};

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Validates that a manifest object satisfies the base contract.
 *
 * Usage:
 *   import type { assertManifest } from "./manifest";
 *   const manifest = { ... } satisfies WebExtensionManifest;
 */
export type AssertManifest<T extends WebExtensionManifest> = T;

/** Deep partial – useful when building a manifest incrementally */
export type PartialManifest = Partial<WebExtensionManifest>;

/** Extract all permission names that appear in a manifest */
export type ExtractPermissions<T extends WebExtensionManifest> =
  T["permissions"] extends (infer P)[] ? P : never;
