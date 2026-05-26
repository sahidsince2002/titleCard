package com.titlecard.backendlogic.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.titlecard.backendlogic.entity.Title;
import com.titlecard.backendlogic.service.TitleService;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("api/v1/title")
public class TitleController {
    @Autowired
    private TitleService titleService;

    @GetMapping("/search")
    public List<Title> search(@RequestParam String name){
        
        return titleService.findName(name);
       
    }
}
