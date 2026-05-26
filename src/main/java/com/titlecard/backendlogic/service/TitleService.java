package com.titlecard.backendlogic.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.titlecard.backendlogic.entity.Title;
import com.titlecard.backendlogic.repository.TitleRepo;

@Service
public class TitleService {
    @Autowired
    private TitleRepo titleRepo;
    
    public List<Title> findName(String name){
        return titleRepo.findByNameContainingIgnoreCase(name);
    }
}
