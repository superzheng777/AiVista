package com.superz.aivista.generation.model;

/** 生成图片对象组的固定键规则。数据库 object_key 保存 prefix，而非具体对象键。 */
public record GenerationImageObjectKeys(String prefix) {
    public static GenerationImageObjectKeys fromStoredValue(String value) {
        return new GenerationImageObjectKeys(value);
    }

    public String original() {
        return prefix + "/original.png";
    }

    public String thumbnail() {
        return prefix + "/card.webp";
    }

    public String display() {
        return prefix + "/display.webp";
    }
}
