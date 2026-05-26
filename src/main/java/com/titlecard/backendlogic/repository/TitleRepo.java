package com.titlecard.backendlogic.repository;

import java.util.List;


import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.titlecard.backendlogic.entity.Title;

@Repository
public interface TitleRepo extends JpaRepository<Title, Long>{
    
    List<Title> findByNameContainingIgnoreCase(String name);
}
