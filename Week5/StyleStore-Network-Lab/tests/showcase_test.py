"""Dependency-free contracts for the standalone showcase shell, not runtime QA.

Run from any directory: python3 -B tests/showcase_test.py
The shell owns presentation only; backend and React behavior have separate tests.
"""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SECTIONS = [
    ("problem", "Problem & Scope"),
    ("concepts", "Architecture Concepts"),
    ("architecture", "System Architecture"),
    ("prompt", "AI Prompt"),
    ("audit", "Audit"),
    ("working", "Working System"),
    ("verification", "Verification"),
]
SOURCES = {
    "https://docs.docker.com/engine/network/drivers/bridge/",
    "https://docs.docker.com/reference/compose-file/networks/#internal",
    "https://docs.docker.com/compose/how-tos/networking/",
    "https://nginx.org/en/docs/http/load_balancing.html",
    "https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream",
    "https://docs.docker.com/reference/compose-file/services/#healthcheck",
}
THEMES = ["standard", "playful-pop", "raggedy-granite", "glossy-marble",
          "luminous-midnight", "gothic-stickerboard", "baroque-plexiglas"]


class Element:
    def __init__(self, tag="document", attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    def find(self, tag=None, cls=None, **attrs):
        found = []
        for child in self.children:
            if not isinstance(child, Element):
                continue
            if ((tag is None or child.tag == tag)
                and (cls is None or cls in child.attrs.get("class", "").split())
                and all((key.replace("_", "-") in child.attrs if value is None
                         else child.attrs.get(key.replace("_", "-")) == value)
                        for key, value in attrs.items())):
                found.append(child)
            found.extend(child.find(tag, cls, **attrs))
        return found

    def text(self):
        return "".join(child.text() if isinstance(child, Element) else child
                       for child in self.children)


class Document(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
        self.errors = []
        self.feed(html)
        if len(self.stack) != 1:
            self.errors.append("unclosed: " + ", ".join(n.tag for n in self.stack[1:]))

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if len(self.stack) == 1 or self.stack[-1].tag != tag:
            self.errors.append("mismatched closing tag: " + tag)
            return
        self.stack.pop()

    def handle_data(self, data):
        self.stack[-1].children.append(data)


class ShowcaseTests(unittest.TestCase):
    def test_backend_nodes_have_visible_private_boundary_inset(self):
        private = self.tree.find('rect', cls='network-map__zone--private')[0].attrs
        left, top = float(private['x']), float(private['y'])
        right = left + float(private['width'])
        bottom = top + float(private['height'])
        for name in ['store-a', 'store-b']:
            group = self.tree.find('g', data_diagram_node=name)[0]
            node = group.find('rect')[0].attrs
            self.assertGreaterEqual(float(node['x']) - left, 12, name)
            self.assertGreaterEqual(right - float(node['x']) - float(node['width']), 12, name)
            self.assertGreaterEqual(float(node['y']) - top, 12, name)
            self.assertGreaterEqual(bottom - float(node['y']) - float(node['height']), 12, name)

    def setUp(self):
        self.html = (ROOT / "index.html").read_text() if (ROOT / "index.html").exists() else ""
        self.css = (ROOT / "styles/network-showcase.css").read_text() if (ROOT / "styles/network-showcase.css").exists() else ""
        self.doc = Document(self.html)
        self.tree = self.doc.root

    def one(self, tag=None, cls=None, **attrs):
        nodes = self.tree.find(tag, cls, **attrs)
        self.assertEqual(len(nodes), 1, (tag, cls, attrs, len(nodes)))
        return nodes[0]

    def section(self, key):
        return self.one("section", data_architecture_section=key)

    def test_owned_artifacts_exist(self):
        for name in ["index.html", "styles/network-showcase.css", "assets/sneaker.svg"]:
            with self.subTest(file=name):
                self.assertTrue((ROOT / name).is_file(), "missing shell artifact: " + name)

    def test_semantic_document_and_unique_ids(self):
        self.assertTrue(self.html.startswith("<!DOCTYPE html>"))
        self.assertEqual(self.doc.errors, [])
        self.assertEqual(self.one("html").attrs.get("lang"), "en")
        ids = [n.attrs["id"] for n in self.tree.find() if "id" in n.attrs]
        self.assertEqual(len(ids), len(set(ids)), "duplicate HTML/SVG ID")
        self.assertEqual(len(self.tree.find("h1")), 1)
        self.assertIn("StyleStore Network Lab", self.one("title").text())
        self.assertEqual(self.one("h1").text(), "One storefront. Two servers.")

    def test_seven_direct_main_sections_match_reference(self):
        main = self.one("main", id="main-content")
        direct = [c for c in main.children if isinstance(c, Element)]
        self.assertEqual([c.attrs.get("data-architecture-section") for c in direct], [k for k, _ in SECTIONS])
        for node, (_, heading) in zip(direct, SECTIONS):
            self.assertEqual(node.tag, "section")
            self.assertIn("section-card", node.attrs.get("class", "").split())
            h2 = node.find("h2")
            self.assertEqual(len(h2), 1)
            self.assertEqual(h2[0].text(), heading)
            self.assertEqual(node.attrs.get("aria-labelledby"), h2[0].attrs.get("id"))
        self.assertEqual(len(self.tree.find(cls="process-step")), 7)

    def test_reference_compatibility_without_auth_feature(self):
        classes = self.one("body").attrs.get("class", "").split()
        self.assertTrue({"flexbox-interfaces-page", "application-architecture-page", "network-showcase-page"}.issubset(classes))
        self.assertNotIn("auth-rbac-showcase-page", classes)
        self.assertIn("App Engineering Showcases", self.one(cls="eyebrow").text())
        mount = self.one("div", data_portfolio_navigation=None)
        self.assertEqual(mount.attrs.get("data-current-page"), "stylestore-network-lab")
        self.assertEqual(mount.attrs.get("data-root"), "./")

    def test_styles_and_seven_local_theme_packages(self):
        links = [n.attrs.get("href") for n in self.tree.find("link", rel="stylesheet")]
        required = ["./styles/shared/base.css", "./styles/auth-rbac-showcase.css", "./styles/network-showcase.css", "./styles/storefront.css"]
        self.assertEqual([x for x in links if x in required], required)
        scripts = [n.attrs.get("src") for n in self.tree.find("script")]
        for theme in THEMES:
            self.assertIn(f"./styles/themes/{theme}/theme-config.js", scripts)
        self.assertIn("./styles/themes/theme-registry.js", scripts)
        self.assertIn("./theme.js", scripts)
        self.assertIn("./site-navigation.js", scripts)
        self.assertIn("./copy-code.js", scripts)
        self.assertFalse(any("supabase" in (s or "").lower() or "cloud-theme" in (s or "") for s in scripts))
        self.assertTrue(all(n.attrs.get("src", "").startswith("./") for n in self.tree.find("script")))

    def test_concept_accessible_names_include_visible_card_text(self):
        normalize = lambda value: re.sub(r'[\W_]+', '', value).casefold()
        for card in self.section('concepts').find('a', cls='concept-card'):
            override = card.attrs.get('aria-label')
            if override:
                self.assertIn(normalize(card.text()), normalize(override))
            self.assertTrue(normalize(card.text()))

    def test_process_numbers_use_theme_text_for_contrast(self):
        self.assertRegex(self.css, r'body\.network-showcase-page\s+\.process-number\s*\{[^}]*color:\s*var\(--flex-color-text-primary\)')

    def test_whole_card_links_use_native_visible_content_names(self):
        for card in self.section('concepts').find('a', cls='concept-card'):
            self.assertNotIn('aria-label', card.attrs, 'Do not replace a whole card\'s native content name')
            self.assertIn('new tab', card.attrs.get('title', ''))

    def test_six_whole_concept_cards_are_precise_official_links(self):
        cards = self.section("concepts").find("a", cls="concept-card")
        self.assertEqual(len(cards), 6)
        self.assertEqual({n.attrs.get("href") for n in cards}, SOURCES)
        for node in cards:
            self.assertEqual(node.attrs.get("target"), "_blank")
            self.assertTrue({"noopener", "noreferrer"}.issubset(node.attrs.get("rel", "").split()))
            self.assertIn("new tab", node.attrs.get("aria-label", node.attrs.get("title", "")))
            self.assertEqual(len(node.find("h3")), 1)
            self.assertGreater(len(node.find("p")[0].text()), 60)
            self.assertFalse(node.find("a"), "no nested links")

    def test_accessible_editable_architecture_with_numbered_connections(self):
        section = self.section("architecture")
        figure = section.find("figure")
        self.assertEqual(len(figure), 1)
        img = self.one(cls="network-map", role="img")
        for ref in img.attrs.get("aria-labelledby", "").split():
            self.one(id=ref)
        self.assertEqual(len(img.attrs.get("aria-labelledby", "").split()), 2)
        self.assertEqual(len(img.find("svg", cls="network-map__desktop")), 1)
        svg = img.find("svg")[0]
        self.assertEqual(svg.attrs.get("aria-hidden"), "true")
        flows = svg.find("path", cls="network-map__wire")
        self.assertGreaterEqual(len(flows), 4)
        self.assertTrue(all(n.attrs.get("data-diagram-flow") and n.attrs.get("d") for n in flows))
        self.assertGreaterEqual(len(svg.find("marker")), 1)
        self.assertEqual(len(section.find("details", cls="architecture-disclosure")), 1)
        self.assertIn("Not live telemetry", section.text())

    def test_topology_and_mobile_equivalent_are_explicit(self):
        section = self.section("architecture")
        for cls in ["network-map__desktop", "network-map__mobile"]:
            nodes = section.find(cls=cls)
            self.assertEqual(len(nodes), 1)
            text = nodes[0].text()
            for term in ["public_subnet", "private_subnet", "Nginx", "store-a", "store-b", "React", "80", "1", "2", "3"]:
                self.assertIn(term, text)
        text = section.text().lower()
        for term in ["internal", "same image", "only dual-homed", "no backend host ports", "loopback", "not a cloud", "host privileges"]:
            self.assertIn(term, text)

    def test_prompts_are_copyable_suggestions_with_numbered_build_spec(self):
        section = self.section("prompt")
        self.assertIn("Suggested prompts", section.text())
        steps = section.find("li", data_ai_step=None)
        self.assertEqual(len(steps), 4)
        for node, title in zip(steps, ["Review", "Plan", "Build", "Verify"]):
            self.assertIn(title, node.find("h3")[0].text())
        spec = section.find("details", data_implementation_spec=None)
        self.assertEqual(len(spec), 1)
        self.assertNotIn("open", spec[0].attrs, "long prompt is optional detail")
        build = self.one("code", id="ssnBuildPrompt").text()
        for number in range(1, 9):
            self.assertRegex(build, rf"(?m)^{number}\. ")
        targets = self.tree.find("button", data_copy_target=None)
        self.assertGreaterEqual(len(targets), 5)
        for button in targets:
            self.assertEqual(button.attrs.get("type"), "button")
            target = self.one("code", id=button.attrs["data-copy-target"])
            self.assertTrue(target.text().strip())

    def test_compact_audit_is_a_contract_not_completed_results(self):
        section = self.section("audit")
        self.assertEqual(len(section.find(cls="audit-item")), 4)
        for term in ["Ports", "Network membership", "DNS", "Stateless"]:
            self.assertIn(term, section.text())
        self.assertIn("not completed", section.text().lower())
        self.assertEqual(len(section.find("code")), 1)
        self.assertNotRegex(section.text().lower(), r"all tests passed|initial ai error|audit passed")

    def test_react_mount_has_only_honest_idle_fallback(self):
        section = self.section("working")
        root = self.one("div", id="stylestore-root")
        self.assertIs(root.parent, section)
        self.assertFalse(root.find("button"))
        self.assertFalse(root.find("form"))
        self.assertIn("No requests", root.text())
        self.assertIn("read-only quote", section.text())
        self.assertIn("not a purchase", section.text())
        scripts = self.tree.find("script")
        config = self.one("script", src="./config.js")
        module = self.one("script", src="./src/main.jsx")
        self.assertEqual(module.attrs.get("type"), "module")
        self.assertLess(scripts.index(config), scripts.index(module))
        self.assertLess(self.html.index('id="stylestore-root"'), self.html.index('src="./config.js"'))
        self.assertTrue(self.tree.find("noscript"))
        self.assertNotIn("onclick=", self.html)

    def test_verification_covers_manual_and_operator_boundaries(self):
        text = self.section("verification").text().lower()
        for term in ["quote", "batch", "health", "operator", "keyboard", "mobile", "restore"]:
            self.assertIn(term, text)
        self.assertNotIn("all tests passed", text)
        self.assertGreaterEqual(len(self.section("verification").find("li")), 6)

    def test_no_public_internal_links_or_private_material(self):
        for anchor in self.tree.find("a"):
            href = anchor.attrs.get("href", "")
            self.assertTrue(href.startswith("#") or href in SOURCES, href)
            self.assertNotIn("download", anchor.attrs)
        for term in ["/home/reader", "docs/qa", "shell-red.log", "private chat", "gpt-", "resume/index"]:
            self.assertNotIn(term, self.html.lower())
        self.assertEqual(self.one("footer").find("a")[0].attrs.get("href"), "#main-content")
        ids = {n.attrs["id"] for n in self.tree.find() if "id" in n.attrs}
        for anchor in self.tree.find("a"):
            if anchor.attrs.get("href", "").startswith("#"):
                self.assertIn(anchor.attrs["href"][1:], ids)

    def test_owned_css_inherits_tokens_and_reflows_instead_of_shrinking(self):
        self.assertIn("body.network-showcase-page", self.css)
        self.assertIn("var(--flex-color-", self.css)
        self.assertIn("var(--flex-font-", self.css)
        self.assertRegex(self.css, r"@media\s*\(max-width:\s*1000px\)")
        mobile = self.css.split("@media (max-width: 1000px)", 1)[-1]
        self.assertRegex(mobile, r"\.network-map__desktop\s*\{\s*display:\s*none")
        self.assertRegex(mobile, r"\.network-map__mobile\s*\{\s*display:\s*grid")
        self.assertIn("linear-gradient", self.css)
        self.assertIn("marker-end", self.css)
        self.assertNotRegex(self.css, r"@import|https?://|font-family:\s*['\"]")

    def test_narrow_header_and_boundary_annotations_have_owned_safeguards(self):
        self.assertRegex(self.css, r"@media\s*\(max-width:\s*480px\)")
        self.assertIn(".portfolio-menu__toggle", self.css)
        self.assertIn("paint-order: stroke fill", self.css)
        self.assertGreaterEqual(len(self.tree.find("text", cls="network-map__annotation")), 1)

    def test_sneaker_is_original_self_contained_scalable_art(self):
        path = ROOT / "assets/sneaker.svg"
        self.assertTrue(path.is_file(), "missing original sneaker asset")
        svg = ET.parse(path).getroot()
        ns = "{http://www.w3.org/2000/svg}"
        self.assertEqual(svg.tag, ns + "svg")
        self.assertEqual(len(svg.attrib.get("viewBox", "").split()), 4)
        self.assertIsNotNone(svg.find(ns + "title"))
        self.assertIsNotNone(svg.find(ns + "desc"))
        self.assertGreaterEqual(len(svg.findall(".//" + ns + "path")), 5)
        for node in svg.iter():
            self.assertNotIn(node.tag, {ns + "script", ns + "image", ns + "foreignObject"})
            for key, value in node.attrib.items():
                self.assertFalse(key.endswith("href") and not value.startswith("#"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
