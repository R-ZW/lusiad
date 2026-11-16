package com.lusiad.backend.service.uml;

import net.sourceforge.plantuml.FileFormat;
import net.sourceforge.plantuml.FileFormatOption;
import net.sourceforge.plantuml.SourceStringReader;
import net.sourceforge.plantuml.security.SecurityProfile;
import net.sourceforge.plantuml.security.SecurityUtils;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.*;

public final class PlantUmlRenderer {
    private static final Set<String> TAGS = Set.of("svg", "g", "defs", "clipPath", "rect", "path", "line", "polyline", "polygon", "circle", "ellipse", "text", "tspan", "title", "desc", "linearGradient", "stop");
    private static final Set<String> ATTRS = Set.of("xmlns", "width", "height", "viewBox", "version", "preserveAspectRatio", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "rx", "ry", "r", "d", "points", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "font-family", "font-size", "font-weight", "font-style", "textLength", "lengthAdjust", "text-anchor", "dominant-baseline", "transform", "style", "id", "clip-path", "offset", "stop-color", "stop-opacity", "color");
    private PlantUmlRenderer() {}

    /** Serialized because PlantUML's Smetana and security initialization are process/library state. */
    public static synchronized String render(String description) throws Exception {
        System.setProperty("PLANTUML_SECURITY_PROFILE", "SANDBOX");
        if (SecurityUtils.getSecurityProfile() != SecurityProfile.SANDBOX) throw new IOException("PlantUML sandbox unavailable");
        var reader = new SourceStringReader(description);
        if (reader.getBlocks().size() != 1 || reader.getBlocks().getFirst().getDiagram() instanceof net.sourceforge.plantuml.error.PSystemError)
            throw new IOException("Invalid generated UML description");
        var bytes = new ByteArrayOutputStream();
        var result = reader.outputImage(bytes, new FileFormatOption(FileFormat.SVG));
        if (result == null || bytes.size() > 8 * 1024 * 1024) throw new IOException("Invalid UML output");
        return passiveSvg(bytes.toString(StandardCharsets.UTF_8));
    }
    /** Strip source metadata, comments, links and anything outside passive SVG primitives. */
    public static String passiveSvg(String svg) throws Exception {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        var document = factory.newDocumentBuilder().parse(new ByteArrayInputStream(svg.getBytes(StandardCharsets.UTF_8)));
        if (!"svg".equals(document.getDocumentElement().getLocalName())) throw new IOException("Not SVG");
        clean(document.getDocumentElement());
        var transformerFactory = TransformerFactory.newInstance();
        transformerFactory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        transformerFactory.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
        var transformer = transformerFactory.newTransformer();
        transformer.setOutputProperty("omit-xml-declaration", "yes");
        var output = new StringWriter();
        transformer.transform(new DOMSource(document.getDocumentElement()), new StreamResult(output));
        return output.toString();
    }
    private static void clean(Element element) {
        var attributes = element.getAttributes();
        for (int i = attributes.getLength() - 1; i >= 0; i--) {
            var a = attributes.item(i);
            String value = a.getNodeValue().toLowerCase(java.util.Locale.ROOT);
            if (!ATTRS.contains(a.getNodeName()) || value.contains("url(") || value.contains("javascript:") || value.contains("expression(")) element.removeAttributeNode((Attr) a);
        }
        for (Node child = element.getFirstChild(); child != null;) {
            Node next = child.getNextSibling();
            if (child instanceof Element el) {
                if (!TAGS.contains(el.getLocalName()) || !"http://www.w3.org/2000/svg".equals(el.getNamespaceURI())) element.removeChild(child);
                else clean(el);
            } else if (child.getNodeType() != Node.TEXT_NODE) element.removeChild(child);
            child = next;
        }
    }
}
